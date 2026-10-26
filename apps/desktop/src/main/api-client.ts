import { z } from 'zod';
import {
  collelSchema,
  errorSchema,
  sessionSchema,
  tokenResponseSchema,
  setupStatusSchema,
  collelDirectorySchema,
  createdCollelSchema,
  collelDirectoryEntrySchema,
  generatedCredentialsSchema,
  activationResponseSchema,
  bookSchema,
  bookDirectorySchema,
  importSummarySchema,
} from '@catalog/contracts';
import type { DesktopApi, ErrorCode, LoginInput, Result, Session } from '@catalog/contracts';

export class ClientError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

export function validateApiUrl(raw: string, packaged: boolean) {
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API_BASE_URL must be an origin without credentials.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !packaged)) {
    throw new Error('API_BASE_URL requires HTTPS (local HTTP is available in development).');
  }
  return url.origin;
}

export interface ActivationStore {
  load(): Promise<string | null>;
  save(token: string | null): Promise<void>;
}
export function createApiClient(
  origin: string,
  store: ActivationStore = {
    load: async () => null,
    save: async () => {},
  },
): Omit<DesktopApi, 'chooseBookImport' | 'saveBookTemplate'> {
  let token: string | undefined;
  let generation = 0;
  let deviceSession = false;
  let savedActivation: string | null | undefined;
  let resuming: Promise<Session | null> | null = null;

  async function getActivation() {
    if (savedActivation === undefined) {
      try {
        savedActivation = await store.load();
      } catch {
        throw new ClientError('DEVICE_STORAGE_UNAVAILABLE');
      }
    }
    return savedActivation;
  }
  async function saveActivation(value: string | null) {
    try {
      await store.save(value);
      savedActivation = value;
    } catch {
      throw new ClientError('DEVICE_STORAGE_UNAVAILABLE');
    }
  }

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    bearer: string | null = token ?? null,
    retry = true,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${origin}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new ClientError('UNAVAILABLE');
    }
    if (!response.ok) {
      if (response.status === 401 && bearer === token) {
        token = undefined;
        if (deviceSession && retry && (await resume()))
          return request(path, schema, init, token, false);
      }
      const failure = errorSchema.safeParse(await response.json().catch(() => null));
      throw new ClientError(failure.success ? failure.data.code : 'INTERNAL_ERROR');
    }
    const value: unknown = response.status === 204 ? null : await response.json();
    return schema.parse(value);
  }

  async function resume(): Promise<Session | null> {
    if (resuming) return resuming;
    const current = generation;
    resuming = (async () => {
      const activation = await getActivation();
      if (!activation) return null;
      try {
        const response = await request(
          '/v1/catalog/resume',
          tokenResponseSchema,
          { method: 'POST' },
          activation,
          false,
        );
        if (current !== generation) {
          await request('/v1/auth/logout', z.null(), { method: 'POST' }, response.token, false);
          return null;
        }
        token = response.token;
        deviceSession = true;
        return response.session;
      } catch (error) {
        if (error instanceof ClientError && error.code === 'UNAUTHENTICATED') {
          await saveActivation(null);
          return null;
        }
        throw error;
      }
    })();
    try {
      return await resuming;
    } finally {
      resuming = null;
    }
  }

  async function result<T>(work: () => Promise<T>): Promise<Result<T>> {
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      return { ok: false, error: error instanceof ClientError ? error.code : 'INTERNAL_ERROR' };
    }
  }

  function signIn(path: string, input: LoginInput) {
    return result(async () => {
      const current = ++generation;
      const response = await request(
        path,
        tokenResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        null,
      );
      if (current !== generation) {
        await request('/v1/auth/logout', z.null(), { method: 'POST' }, response.token);
        throw new ClientError('UNAUTHENTICATED');
      }
      token = response.token;
      deviceSession = false;
      return response.session;
    });
  }

  return {
    listBooks: (collelId, input) =>
      result(() => {
        const query = new URLSearchParams(
          Object.entries(input).map(([key, value]) => [key, String(value)]),
        );
        return request(
          `/v1/collels/${encodeURIComponent(collelId)}/books?${query}`,
          bookDirectorySchema,
        );
      }),
    getBook: (collelId, id) =>
      result(() =>
        request(
          `/v1/collels/${encodeURIComponent(collelId)}/books/${encodeURIComponent(id)}`,
          bookSchema,
        ),
      ),
    createBook: (collelId, input) =>
      result(() =>
        request(`/v1/collels/${encodeURIComponent(collelId)}/books`, bookSchema, {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    updateBook: (collelId, id, input) =>
      result(() =>
        request(
          `/v1/collels/${encodeURIComponent(collelId)}/books/${encodeURIComponent(id)}`,
          bookSchema,
          { method: 'PATCH', body: JSON.stringify(input) },
        ),
      ),
    deleteBook: (collelId, book) =>
      result(() =>
        request(
          `/v1/collels/${encodeURIComponent(collelId)}/books/${encodeURIComponent(book.id)}`,
          z.null(),
          { method: 'DELETE', body: JSON.stringify({ version: book.version }) },
        ),
      ),
    moveBooks: (collelId, input) =>
      result(() =>
        request(`/v1/collels/${encodeURIComponent(collelId)}/books/move`, z.null(), {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    bulkBooks: (collelId, input) =>
      result(() =>
        request(`/v1/collels/${encodeURIComponent(collelId)}/books/bulk`, z.null(), {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    importBooks: (collelId, books) =>
      result(() =>
        request(`/v1/collels/${encodeURIComponent(collelId)}/books/import`, importSummarySchema, {
          method: 'POST',
          body: JSON.stringify({ books }),
        }),
      ),
    login: (input) => signIn('/v1/auth/login', input),
    activate: (input) =>
      result(async () => {
        const current = ++generation;
        const response = await request(
          '/v1/catalog/activate',
          activationResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify(input),
          },
          null,
        );
        try {
          if (current !== generation) throw new ClientError('UNAUTHENTICATED');
          await saveActivation(response.activationToken);
        } catch (error) {
          await request(
            '/v1/catalog/deactivate',
            z.null(),
            { method: 'POST' },
            response.activationToken,
            false,
          ).catch(() => {});
          throw error;
        }
        token = response.token;
        deviceSession = true;
        return response.session;
      }),
    deactivate: () =>
      result(async () => {
        const activation = await getActivation();
        await saveActivation(null);
        token = undefined;
        deviceSession = false;
        generation++;
        if (activation)
          await request('/v1/catalog/deactivate', z.null(), { method: 'POST' }, activation, false);
        return null;
      }),
    platformLogin: (input) => signIn('/v1/platform/login', input),
    setup: (input) => signIn('/v1/platform/setup', input),
    setupStatus: () => result(() => request('/v1/platform/setup', setupStatusSchema, {}, null)),
    changePassword: (input) =>
      result(() =>
        request('/v1/auth/password', sessionSchema, {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    listCollels: (input) =>
      result(() => {
        const query = new URLSearchParams({ search: input.search, page: String(input.page) });
        return request(`/v1/platform/collels?${query.toString()}`, collelDirectorySchema);
      }),
    createCollel: (input) =>
      result(() =>
        request('/v1/platform/collels', createdCollelSchema, {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    updateCollel: (id, input) =>
      result(() =>
        request(`/v1/platform/collels/${encodeURIComponent(id)}`, collelDirectoryEntrySchema, {
          method: 'PATCH',
          body: JSON.stringify(input),
        }),
      ),
    resetCollelAdmin: (id) =>
      result(() =>
        request(
          `/v1/platform/collels/${encodeURIComponent(id)}/reset-admin`,
          generatedCredentialsSchema,
          { method: 'POST' },
        ),
      ),
    deleteCollel: (id, input) =>
      result(() =>
        request(`/v1/platform/collels/${encodeURIComponent(id)}`, z.null(), {
          method: 'DELETE',
          body: JSON.stringify(input),
        }),
      ),
    resetCollelAccess: (id) =>
      result(() =>
        request(
          `/v1/platform/collels/${encodeURIComponent(id)}/reset-access`,
          generatedCredentialsSchema,
          { method: 'POST' },
        ),
      ),
    logout: () =>
      result(async () => {
        const previous = token;
        token = undefined;
        deviceSession = false;
        generation++;
        if (previous) await request('/v1/auth/logout', z.null(), { method: 'POST' }, previous);
        return null;
      }),
    session: () =>
      result(async () => (token ? request('/v1/auth/session', sessionSchema) : resume())),
    collel: (id) =>
      result(async () => {
        if (!token) throw new ClientError('UNAUTHENTICATED');
        return request(`/v1/collels/${encodeURIComponent(id)}`, collelSchema);
      }),
  };
}
