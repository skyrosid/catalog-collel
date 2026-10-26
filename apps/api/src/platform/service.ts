import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  collelDirectoryEntrySchema,
  collelDirectorySchema,
  sessionSchema,
  setupStatusSchema,
} from '@catalog/contracts';
import type {
  CollelDirectory,
  CollelDirectoryEntry,
  CreatedCollel,
  CreateCollelInput,
  DirectoryQuery,
  GeneratedCredentials,
  Session,
  SetupInput,
  SetupStatus,
  UpdateCollelInput,
  DeleteCollelInput,
} from '@catalog/contracts';
import type { Principal } from '../auth/service.js';
import { AppError } from '../errors.js';
import { hashPassword } from '../auth/password.js';

export interface PlatformServices {
  setupStatus(): Promise<SetupStatus>;
  setup(input: SetupInput): Promise<{ token: string; session: Session }>;
  listCollels(principal: Principal, query: DirectoryQuery): Promise<CollelDirectory>;
  createCollel(principal: Principal, input: CreateCollelInput): Promise<CreatedCollel>;
  updateCollel(
    principal: Principal,
    id: string,
    input: UpdateCollelInput,
  ): Promise<CollelDirectoryEntry>;
  resetCollelAdmin(principal: Principal, id: string): Promise<GeneratedCredentials>;
  resetCollelAccess(principal: Principal, id: string): Promise<GeneratedCredentials>;
  deleteCollel(principal: Principal, id: string, input: DeleteCollelInput): Promise<void>;
}

export function requireSuperadmin(principal: Principal) {
  if (principal.session.user.platformRole !== 'super_admin') throw new AppError(403, 'FORBIDDEN');
  if (principal.session.user.mustChangePassword)
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED');
}

export function createPlatformServices(pool: pg.Pool, ttlHours: number): PlatformServices {
  async function query(sql: string, values: unknown[] = []) {
    try {
      const result = await pool.query<{ value: unknown }>(sql, values);
      return result.rows[0]?.value;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        switch (error.code) {
          case '23505':
            throw new AppError(409, 'CONFLICT');
          case 'P0409':
            throw new AppError(409, 'SETUP_COMPLETE');
          case 'P0403':
            throw new AppError(403, 'FORBIDDEN');
          case 'P0404':
            throw new AppError(404, 'NOT_FOUND');
          case 'P0401':
            throw new AppError(401, 'UNAUTHENTICATED');
          case '22023':
            throw new AppError(400, 'INVALID_INPUT');
        }
      }
      throw error;
    }
  }

  return {
    async setupStatus() {
      return setupStatusSchema.parse(await query('SELECT app.setup_status() AS value'));
    },
    async deleteCollel(principal, id, input) {
      requireSuperadmin(principal);
      await query('SELECT app.platform_delete_collel($1, $2, $3) AS value', [
        principal.sessionHash,
        id,
        input.slug,
      ]);
    },
    async setup(input) {
      // Hash before taking the DB lock; creating identity + session is one atomic statement.
      const passwordHash = await hashPassword(input.password);
      const token = randomBytes(32).toString('hex');
      const sessionHash = createHash('sha256').update(token).digest('hex');
      const value = await query('SELECT app.create_first_superadmin($1, $2, $3, $4) AS value', [
        input.login,
        passwordHash,
        sessionHash,
        ttlHours,
      ]);
      return { token, session: sessionSchema.parse(value) };
    },
    async listCollels(principal, input) {
      requireSuperadmin(principal);
      return collelDirectorySchema.parse(
        await query('SELECT app.platform_collels($1, $2, $3) AS value', [
          principal.sessionHash,
          input.search,
          input.page,
        ]),
      );
    },
    async createCollel(principal, input) {
      requireSuperadmin(principal);
      const password = randomBytes(18).toString('base64url');
      const accessPassword = randomBytes(18).toString('base64url');
      const value = await query('SELECT app.platform_create_collel($1, $2, $3, $4, $5) AS value', [
        principal.sessionHash,
        input.name,
        input.slug,
        await hashPassword(password),
        await hashPassword(accessPassword),
      ]);
      const collel = collelDirectoryEntrySchema.parse(value);
      if (!collel.access) throw new AppError(500, 'INTERNAL_ERROR');
      return {
        collel,
        credentials: {
          admin: { login: collel.admin.login, password },
          catalog: { login: collel.access.login, password: accessPassword },
        },
      };
    },
    async updateCollel(principal, id, input) {
      requireSuperadmin(principal);
      return collelDirectoryEntrySchema.parse(
        await query('SELECT app.platform_update_collel($1, $2, $3, $4, $5) AS value', [
          principal.sessionHash,
          id,
          input.name,
          input.slug,
          input.active,
        ]),
      );
    },
    async resetCollelAdmin(principal, id) {
      requireSuperadmin(principal);
      const password = randomBytes(18).toString('base64url');
      const login = await query('SELECT app.platform_reset_admin($1, $2, $3) AS value', [
        principal.sessionHash,
        id,
        await hashPassword(password),
      ]);
      if (typeof login !== 'string') throw new AppError(500, 'INTERNAL_ERROR');
      return { login, password };
    },
    async resetCollelAccess(principal, id) {
      requireSuperadmin(principal);
      const password = randomBytes(18).toString('base64url');
      const login = await query('SELECT app.platform_reset_access($1, $2, $3) AS value', [
        principal.sessionHash,
        id,
        await hashPassword(password),
      ]);
      if (typeof login !== 'string') throw new AppError(500, 'INTERNAL_ERROR');
      return { login, password };
    },
  };
}
