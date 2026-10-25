import { buildApp } from './app.js';
import { createServices } from './auth/service.js';
import { readConfig } from './config.js';
import { createPool, verifyRuntimeRole } from './db/pool.js';

const config = readConfig();
const pool = createPool({
  url: config.DATABASE_URL,
  tls: config.DATABASE_TLS === 'true',
  privateNetwork: config.DATABASE_PRIVATE_NETWORK === 'true',
  allowInsecureRemote:
    config.NODE_ENV === 'development' && config.DATABASE_ALLOW_INSECURE_REMOTE === 'true',
  ...(config.DATABASE_CA_FILE ? { caFile: config.DATABASE_CA_FILE } : {}),
});
pool.on('error', () => {
  console.error('PostgreSQL pool connection failed.');
});

try {
  await verifyRuntimeRole(pool);
  const app = buildApp(await createServices(pool, config.SESSION_TTL_HOURS));
  app.addHook('onClose', async () => pool.end());
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    });
  }
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  console.error('API startup failed:', error instanceof Error ? error.message : String(error));
  await pool.end();
  process.exitCode = 1;
}
