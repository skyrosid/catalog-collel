import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';

describe('database transport configuration', () => {
  it('refuses unencrypted remote PostgreSQL and URL options overriding verified TLS', () => {
    expect(() =>
      createPool({ url: 'postgresql://user:pass@db.example.org/catalog', tls: false }),
    ).toThrow('verified TLS');
    expect(() =>
      createPool({
        url: 'postgresql://user:pass@db.example.org/catalog?sslmode=no-verify',
        tls: true,
      }),
    ).toThrow('URL parameters');
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@db/catalog',
        DATABASE_TLS: 'false',
      }),
    ).toThrow('verified TLS');
  });
  it('allows a private Dokploy network only through explicit server configuration', async () => {
    const config = readConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@db/catalog',
      DATABASE_TLS: 'false',
      DATABASE_PRIVATE_NETWORK: 'true',
    });
    const pool = createPool({ url: config.DATABASE_URL, tls: false, privateNetwork: true });
    await pool.end();
  });
});
