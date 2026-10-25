import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { AppError } from '../src/errors.js';
import { requireMembership } from '../src/auth/service.js';
import type { Principal, Services } from '../src/auth/service.js';

const collelId = '00000000-0000-4000-8000-000000000001';
const principal: Principal = {
  sessionHash: 'a'.repeat(64),
  session: {
    user: {
      id: '00000000-0000-4000-8000-000000000002',
      displayName: 'Utilisateur',
      platformRole: 'member',
      mustChangePassword: false,
    },
    memberships: [{ collelId, role: 'user', name: 'Hevron' }],
  },
};
const services: Services = {
  setupStatus: vi.fn(),
  setup: vi.fn(),
  listCollels: vi.fn(),
  createCollel: vi.fn(),
  updateCollel: vi.fn(),
  resetCollelAdmin: vi.fn(),
  resetCollelAccess: vi.fn(),
  activate: vi.fn(),
  resume: vi.fn(),
  deactivate: vi.fn(),
  changePassword: vi.fn(),
  login: vi.fn(async () => {
    throw new AppError(401, 'UNAUTHENTICATED');
  }),
  authenticate: vi.fn(async () => {
    throw new AppError(401, 'UNAUTHENTICATED');
  }),
  logout: vi.fn(async () => {}),
  getCollel: vi.fn(async () => {
    throw new Error('sensitive database detail');
  }),
  ready: vi.fn(async () => {}),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.clearAllMocks();
});
function setup() {
  const app = buildApp(services, false);
  apps.push(app);
  return app;
}

describe('API boundaries', () => {
  it('rejects anonymous tenant access and reports generic login errors', async () => {
    const app = setup();
    expect((await app.inject({ url: `/v1/collels/${collelId}` })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { login: 'unknown', password: 'password' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('validates untrusted input and limits login attempts', async () => {
    const app = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { login: 'admin', password: 'p', collelId },
    });
    expect(response.statusCode).toBe(400);
    for (let index = 0; index < 4; index++) {
      await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { login: 'admin', password: 'p' },
      });
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { login: 'admin', password: 'p' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('does not leak internal failures', async () => {
    const failing = { ...services, authenticate: vi.fn(async () => principal) };
    const app = buildApp(failing, false);
    apps.push(app);
    const response = await app.inject({
      url: `/v1/collels/${collelId}`,
      headers: { authorization: `Bearer ${'a'.repeat(64)}` },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('sensitive');
    expect(response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
  it('separates administrator and standard-user permissions', () => {
    expect(requireMembership(principal, collelId).role).toBe('user');
    expect(() => requireMembership(principal, collelId, 'admin')).toThrow('FORBIDDEN');
    expect(() => requireMembership(principal, '00000000-0000-4000-8000-000000000003')).toThrow(
      'FORBIDDEN',
    );
  });
});
