import { readConfig } from './config.js';
import { createPool, verifyRuntimeRole } from './db/pool.js';
import { createServices } from './auth/service.js';
import { buildApp } from './app.js';

const config = readConfig();
const pool = createPool({
  url: config.DATABASE_URL,
  tls: config.DATABASE_TLS === 'true',
  privateNetwork: config.DATABASE_PRIVATE_NETWORK === 'true',
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
} catch {
  console.error('API startup failed. Check the environment, migrations, and database role.');
  await pool.end();
  process.exitCode = 1;
}
