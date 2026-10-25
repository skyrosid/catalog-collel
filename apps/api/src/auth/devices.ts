import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { sessionSchema } from '@catalog/contracts';
import type { LoginInput, Session } from '@catalog/contracts';
import { AppError } from '../errors.js';

export interface DeviceServices {
  activate(
    input: LoginInput,
  ): Promise<{ token: string; activationToken: string; session: Session }>;
  resume(activationToken: string | undefined): Promise<{ token: string; session: Session }>;
  deactivate(activationToken: string | undefined): Promise<void>;
}
function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function checkedHash(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'UNAUTHENTICATED');
  return hash(token);
}

export function createDeviceServices(
  pool: pg.Pool,
  ttlHours: number,
  login: (input: LoginInput) => Promise<{ token: string; session: Session }>,
): DeviceServices {
  return {
    async activate(input) {
      const loggedIn = await login(input);
      const activationToken = randomBytes(32).toString('hex');
      try {
        await pool.query('SELECT app.activate_device($1, $2)', [
          hash(loggedIn.token),
          hash(activationToken),
        ]);
      } catch {
        await pool.query('SELECT app.close_session($1)', [hash(loggedIn.token)]);
        throw new AppError(403, 'FORBIDDEN');
      }
      return { ...loggedIn, activationToken };
    },
    async resume(activationToken) {
      const deviceHash = checkedHash(activationToken);
      const token = randomBytes(32).toString('hex');
      try {
        const result = await pool.query<{ value: unknown }>(
          'SELECT app.resume_device($1, $2, $3) AS value',
          [deviceHash, hash(token), ttlHours],
        );
        return { token, session: sessionSchema.parse(result.rows[0]?.value) };
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
    },
    async deactivate(activationToken) {
      await pool.query('SELECT app.revoke_device($1)', [checkedHash(activationToken)]);
    },
  };
}
