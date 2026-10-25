import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, validateApiUrl } from './api-client.js';
import { rendererFile } from './security.js';

afterEach(() => vi.unstubAllGlobals());
describe('Electron trust boundaries', () => {
  it('requires HTTPS in packaged applications and rejects origin credentials', () => {
    expect(validateApiUrl('http://127.0.0.1:3000', false)).toBe('http://127.0.0.1:3000');
    for (const value of [
      'http://api.example.org',
      'http://127.0.0.1:3000',
      'https://user:pass@api.example.org',
      'https://api.example.org/path',
    ]) {
      expect(() => validateApiUrl(value, true)).toThrow();
    }
    expect(validateApiUrl('https://api.example.org', true)).toBe('https://api.example.org');
  });
  it('serves only files within the packaged renderer', () => {
    const root = path.resolve('renderer');
    expect(rendererFile(root, 'app://catalog/index.html')).toBe(path.join(root, 'index.html'));
    for (const url of [
      'app://other/index.html',
      'https://catalog/index.html',
      'app://catalog/%2e%2e%2fsecret',
      'app://catalog/%5csecret',
      'app://catalog/%00',
    ]) {
      expect(rendererFile(root, url)).toBeNull();
    }
  });
  it('keeps bearer tokens out of the renderer and clears them on logout', async () => {
    const token = 'a'.repeat(64);
    const session = {
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: 'Admin',
        platformRole: 'member',
        mustChangePassword: false,
      },
      memberships: [
        {
          collelId: '00000000-0000-4000-8000-000000000002',
          name: 'Hevron',
          role: 'admin',
        },
      ],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token, session }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://api.example.org');
    expect(await api.login({ login: 'admin', password: 'password' })).toEqual({
      ok: true,
      data: session,
    });
    expect(await api.logout()).toEqual({ ok: true, data: null });
    expect(fetcher.mock.calls[1]?.[1].headers.Authorization).toBe(`Bearer ${token}`);
    expect(await api.session()).toEqual({ ok: true, data: null });
  });
});
