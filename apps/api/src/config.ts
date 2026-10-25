import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  DATABASE_TLS: z.enum(['true', 'false']).default('true'),
  DATABASE_PRIVATE_NETWORK: z.enum(['true', 'false']).default('false'),
  DATABASE_ALLOW_INSECURE_REMOTE: z.enum(['true', 'false']).default('false'),
  DATABASE_CA_FILE: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  if (
    result.data.DATABASE_ALLOW_INSECURE_REMOTE === 'true' &&
    result.data.NODE_ENV !== 'development'
  ) {
    throw new Error('DATABASE_ALLOW_INSECURE_REMOTE is available only in development.');
  }
  if (
    result.data.NODE_ENV === 'production' &&
    result.data.DATABASE_TLS !== 'true' &&
    result.data.DATABASE_PRIVATE_NETWORK !== 'true'
  ) {
    throw new Error('Production PostgreSQL connections require verified TLS.');
  }
  return result.data;
}
