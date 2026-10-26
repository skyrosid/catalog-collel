import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api-client.js';
const session = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'Library',
    platformRole: 'member',
    mustChangePassword: false,
  },
  memberships: [
    { collelId: '00000000-0000-4000-8000-000000000002', name: 'Library', role: 'user' },
  ],
};
const token = 'a'.repeat(64);
const activationToken = 'b'.repeat(64);
afterEach(() => vi.unstubAllGlobals());
describe('persistent catalogue activation', () => {
  it('keeps activation credentials in the main process and restores a new session after restart', async () => {
    let saved: string | null = null;
    const store = {
      load: async () => saved,
      save: async (value: string | null) => {
        saved = value;
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token, activationToken, session }))
      .mockResolvedValueOnce(Response.json({ token: 'c'.repeat(64), session }));
    vi.stubGlobal('fetch', fetcher);
    const client = createApiClient('https://api.example.org', store);
    expect(await client.activate({ login: 'catalog-library', password: 'secret' })).toEqual({
      ok: true,
      data: session,
    });
    expect(saved).toBe(activationToken);
    const restarted = createApiClient('https://api.example.org', store);
    expect(await restarted.session()).toEqual({ ok: true, data: session });
    expect(fetcher.mock.calls[1]?.[1].headers.Authorization).toBe(`Bearer ${activationToken}`);
    expect(fetcher.mock.calls[1]?.[1].body).toBeUndefined();
  });
  it('refuses unprotected activation when persistence fails and revokes the server token', async () => {
    const store = {
      load: async () => null,
      save: vi.fn().mockRejectedValue(new Error('OS key unavailable')),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token, activationToken, session }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const client = createApiClient('https://api.example.org', store);
    expect(await client.activate({ login: 'catalog-library', password: 'secret' })).toEqual({
      ok: false,
      error: 'DEVICE_STORAGE_UNAVAILABLE',
    });
    expect(fetcher.mock.calls[1]?.[0]).toContain('/v1/catalog/deactivate');
  });
  it('removes a revoked activation but preserves it during temporary network failure', async () => {
    const store = { load: async () => activationToken, save: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await createApiClient('https://api.example.org', store).session()).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    expect(store.save).not.toHaveBeenCalled();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
    );
    expect(await createApiClient('https://api.example.org', store).session()).toEqual({
      ok: true,
      data: null,
    });
    expect(store.save).toHaveBeenCalledWith(null);
  });
  it('renews an expired catalogue session without exposing or resubmitting a password', async () => {
    const store = { load: async () => activationToken, save: async () => {} };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token, session }))
      .mockResolvedValueOnce(Response.json({ code: 'UNAUTHENTICATED' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ token: 'c'.repeat(64), session }))
      .mockResolvedValueOnce(
        Response.json({ id: session.memberships[0]!.collelId, name: 'Library' }),
      );
    vi.stubGlobal('fetch', fetcher);
    const client = createApiClient('https://api.example.org', store);
    await client.session();
    expect((await client.collel(session.memberships[0]!.collelId)).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every((call) => !call[1].body)).toBe(true);
  });
});
