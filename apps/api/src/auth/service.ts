import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { sessionSchema } from '@catalog/contracts';
import type { Collel, LoginInput, Role, Session } from '@catalog/contracts';
import { AppError } from '../errors.js';
import { inTenant } from '../db/pool.js';
import { hashPassword, verifyPassword } from './password.js';
import { createPlatformServices } from '../platform/service.js';
import type { PlatformServices } from '../platform/service.js';
import type { ChangePasswordInput } from '@catalog/contracts';
import { createDeviceServices } from './devices.js';
import type { DeviceServices } from './devices.js';

export interface Principal {
  sessionHash: string;
  session: Session;
}

export interface Services extends PlatformServices, DeviceServices {
  login(
    input: LoginInput,
    platform?: boolean,
    role?: Role,
  ): Promise<{ token: string; session: Session }>;
  authenticate(token: string | undefined): Promise<Principal>;
  logout(principal: Principal): Promise<void>;
  getCollel(principal: Principal, collelId: string): Promise<Collel>;
  ready(): Promise<void>;
  changePassword(principal: Principal, input: ChangePasswordInput): Promise<Session>;
}

export function requireMembership(principal: Principal, collelId: string, role?: Role) {
  if (principal.session.user.mustChangePassword)
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED');
  const membership = principal.session.memberships.find((item) => item.collelId === collelId);
  if (!membership || (role === 'admin' && membership.role !== 'admin')) {
    throw new AppError(403, 'FORBIDDEN');
  }
  return membership;
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createServices(pool: pg.Pool, ttlHours: number): Promise<Services> {
  // Unknown usernames incur the same password verification work.
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));

  async function resolve(sessionHash: string): Promise<Session> {
    const result = await pool.query<{ value: unknown }>('SELECT app.session_info($1) AS value', [
      sessionHash,
    ]);
    const session = sessionSchema.safeParse(result.rows[0]?.value);
    if (!session.success) throw new AppError(401, 'UNAUTHENTICATED');
    return session.data;
  }

  const services: Services = {
    ...createPlatformServices(pool, ttlHours),
    ...createDeviceServices(pool, ttlHours, (input) => services.login(input, false, 'user')),
    async login(input, platform = false, role) {
      const result = await pool.query<{ id: string; password_hash: string }>(
        'SELECT * FROM app.login_identity($1)',
        [input.login],
      );
      const user = result.rows[0];
      const valid = await verifyPassword(user?.password_hash ?? dummyHash, input.password);
      if (!user || !valid) throw new AppError(401, 'UNAUTHENTICATED');
      const token = randomBytes(32).toString('hex');
      const sessionHash = tokenHash(token);
      await pool.query('SELECT app.open_session($1, $2, $3)', [user.id, sessionHash, ttlHours]);
      const session = await resolve(sessionHash);
      if (
        (session.user.platformRole === 'super_admin') !== platform ||
        (role && !session.memberships.some((membership) => membership.role === role))
      ) {
        await pool.query('SELECT app.close_session($1)', [sessionHash]);
        throw new AppError(401, 'UNAUTHENTICATED');
      }
      return { token, session };
    },
    async authenticate(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'UNAUTHENTICATED');
      const sessionHash = tokenHash(token);
      return { sessionHash, session: await resolve(sessionHash) };
    },
    async logout(principal) {
      await pool.query('SELECT app.close_session($1)', [principal.sessionHash]);
    },
    async changePassword(principal, input) {
      if (
        principal.session.user.platformRole !== 'super_admin' &&
        !principal.session.memberships.some((membership) => membership.role === 'admin')
      ) {
        throw new AppError(403, 'FORBIDDEN');
      }
      const result = await pool.query<{ value: string | null }>(
        'SELECT app.session_password_hash($1) AS value',
        [principal.sessionHash],
      );
      const currentHash = result.rows[0]?.value;
      if (!currentHash) throw new AppError(401, 'UNAUTHENTICATED');
      if (!(await verifyPassword(currentHash, input.currentPassword)))
        throw new AppError(400, 'INVALID_INPUT');
      try {
        await pool.query('SELECT app.change_password($1, $2, $3)', [
          principal.sessionHash,
          currentHash,
          await hashPassword(input.newPassword),
        ]);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P0401'
        ) {
          throw new AppError(401, 'UNAUTHENTICATED');
        }
        throw error;
      }
      return resolve(principal.sessionHash);
    },
    async getCollel(principal, collelId) {
      requireMembership(principal, collelId);
      return inTenant(pool, principal.sessionHash, collelId, async (client) => {
        const result = await client.query<Collel>(
          'SELECT id, name FROM app.collels WHERE id = $1',
          [collelId],
        );
        const collel = result.rows[0];
        if (!collel) throw new AppError(403, 'FORBIDDEN');
        return collel;
      });
    },
    async ready() {
      await pool.query('SELECT 1');
    },
  };
  return services;
}
