import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import {
  changePasswordSchema,
  createCollelSchema,
  directoryQuerySchema,
  idSchema,
  loginSchema,
  setupInputSchema,
  updateCollelSchema,
  deleteCollelSchema,
  bookInputSchema,
  bookReferenceSchema,
  catalogQuerySchema,
  importBooksSchema,
  moveBooksSchema,
  bulkBooksSchema,
  updateBookSchema,
} from '@catalog/contracts';
import { AppError } from './errors.js';
import type { Services } from './auth/service.js';

export function buildApp(services: Services, logging = true) {
  const app = Fastify({
    bodyLimit: 8192,
    requestTimeout: 15_000,
    trustProxy: false,
    genReqId: () => randomUUID(),
    logger: logging
      ? {
          level: 'info',
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body',
            'res.headers.set-cookie',
          ],
        }
      : false,
  });
  app.register(helmet);
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    const httpStatus =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : undefined;
    if (error instanceof AppError) {
      status = error.status;
      code = error.code;
    } else if (error instanceof ZodError || httpStatus === 400) {
      status = 400;
      code = 'INVALID_INPUT';
    } else if (httpStatus === 429) {
      status = 429;
      code = 'RATE_LIMITED';
    } else if (httpStatus === 413 || httpStatus === 415) {
      status = httpStatus;
      code = 'INVALID_INPUT';
    }
    // Deliberately omit error objects: pg errors may contain personal data and SQL values.
    if (status >= 500) request.log.error({ requestId: request.id }, 'Request failed');
    reply.code(status).send({ code, requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ code: 'NOT_FOUND', requestId: request.id });
  });
  const principal = (header: string | undefined) =>
    services.authenticate(header?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]);

  // Register routes after plugins so rate-limit's onRoute hook sees each route.
  app.register(async (routes) => {
    routes.get('/health/live', async () => ({ status: 'ok' }));
    routes.get('/health/ready', async () => {
      try {
        await services.ready();
      } catch {
        throw new AppError(503, 'UNAVAILABLE');
      }
      return { status: 'ok' };
    });
    routes.post(
      '/v1/auth/login',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      },
      async (request) => services.login(loginSchema.parse(request.body), false, 'admin'),
    );
    routes.get(
      '/v1/auth/session',
      async (request) => (await principal(request.headers.authorization)).session,
    );
    routes.post('/v1/auth/logout', async (request, reply) => {
      await services.logout(await principal(request.headers.authorization));
      return reply.code(204).send();
    });
    routes.post(
      '/v1/auth/password',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      },
      async (request) =>
        services.changePassword(
          await principal(request.headers.authorization),
          changePasswordSchema.parse(request.body),
        ),
    );
    routes.get('/v1/platform/setup', async () => services.setupStatus());
    routes.post(
      '/v1/platform/setup',
      {
        config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
      },
      async (request) => services.setup(setupInputSchema.parse(request.body)),
    );
    routes.post(
      '/v1/platform/login',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      },
      async (request) => services.login(loginSchema.parse(request.body), true),
    );
    routes.post(
      '/v1/catalog/activate',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      },
      async (request) => services.activate(loginSchema.parse(request.body)),
    );
    routes.post('/v1/catalog/resume', async (request) =>
      services.resume(request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]),
    );
    routes.post('/v1/catalog/deactivate', async (request, reply) => {
      await services.deactivate(
        request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1],
      );
      return reply.code(204).send();
    });
    routes.get<{ Querystring: { search?: string; page?: string } }>(
      '/v1/platform/collels',
      async (request) => {
        const actor = await principal(request.headers.authorization);
        const query = directoryQuerySchema.parse({
          search: request.query.search,
          page: request.query.page === undefined ? 0 : Number(request.query.page),
        });
        return services.listCollels(actor, query);
      },
    );
    routes.post('/v1/platform/collels', async (request, reply) => {
      const actor = await principal(request.headers.authorization);
      const created = await services.createCollel(actor, createCollelSchema.parse(request.body));
      return reply.code(201).send(created);
    });
    routes.patch<{ Params: { id: string } }>('/v1/platform/collels/:id', async (request) =>
      services.updateCollel(
        await principal(request.headers.authorization),
        idSchema.parse(request.params.id),
        updateCollelSchema.parse(request.body),
      ),
    );
    routes.delete<{ Params: { id: string } }>(
      '/v1/platform/collels/:id',
      async (request, reply) => {
        await services.deleteCollel(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.id),
          deleteCollelSchema.parse(request.body),
        );
        return reply.code(204).send();
      },
    );
    routes.post<{ Params: { id: string } }>(
      '/v1/platform/collels/:id/reset-admin',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      },
      async (request) =>
        services.resetCollelAdmin(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.id),
        ),
    );
    routes.post<{ Params: { id: string } }>(
      '/v1/platform/collels/:id/reset-access',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      },
      async (request) =>
        services.resetCollelAccess(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.id),
        ),
    );
    routes.get<{ Params: { collelId: string } }>('/v1/collels/:collelId', async (request) => {
      const actor = await principal(request.headers.authorization);
      return services.getCollel(actor, idSchema.parse(request.params.collelId));
    });
    routes.get<{ Params: { collelId: string }; Querystring: Record<string, string> }>(
      '/v1/collels/:collelId/books',
      async (request) => {
        const actor = await principal(request.headers.authorization);
        const raw = request.query;
        const query = catalogQuerySchema.parse({
          ...raw,
          page: raw.page === undefined ? 0 : Number(raw.page),
          pageSize: raw.pageSize === undefined ? 12 : Number(raw.pageSize),
        });
        return services.listBooks(actor, idSchema.parse(request.params.collelId), query);
      },
    );
    routes.get<{ Params: { collelId: string; id: string } }>(
      '/v1/collels/:collelId/books/:id',
      async (request) =>
        services.getBook(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.collelId),
          idSchema.parse(request.params.id),
        ),
    );
    routes.post<{ Params: { collelId: string } }>(
      '/v1/collels/:collelId/books',
      async (request, reply) => {
        const actor = await principal(request.headers.authorization);
        return reply
          .code(201)
          .send(
            await services.createBook(
              actor,
              idSchema.parse(request.params.collelId),
              bookInputSchema.parse(request.body),
            ),
          );
      },
    );
    routes.patch<{ Params: { collelId: string; id: string } }>(
      '/v1/collels/:collelId/books/:id',
      async (request) =>
        services.updateBook(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.collelId),
          idSchema.parse(request.params.id),
          updateBookSchema.parse(request.body),
        ),
    );
    routes.delete<{ Params: { collelId: string; id: string } }>(
      '/v1/collels/:collelId/books/:id',
      async (request, reply) => {
        await services.deleteBook(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.collelId),
          bookReferenceSchema.parse({ ...(request.body as object), id: request.params.id }),
        );
        return reply.code(204).send();
      },
    );
    routes.post<{ Params: { collelId: string } }>(
      '/v1/collels/:collelId/books/move',
      async (request, reply) => {
        await services.moveBooks(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.collelId),
          moveBooksSchema.parse(request.body),
        );
        return reply.code(204).send();
      },
    );
    routes.post<{ Params: { collelId: string } }>(
      '/v1/collels/:collelId/books/bulk',
      { bodyLimit: 16384 },
      async (request, reply) => {
        await services.bulkBooks(
          await principal(request.headers.authorization),
          idSchema.parse(request.params.collelId),
          bulkBooksSchema.parse(request.body),
        );
        return reply.code(204).send();
      },
    );
    routes.post<{ Params: { collelId: string } }>(
      '/v1/collels/:collelId/books/import',
      { bodyLimit: 32 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (request) => {
        const actor = await principal(request.headers.authorization);
        return services.importBooks(
          actor,
          idSchema.parse(request.params.collelId),
          importBooksSchema.parse(request.body).books,
        );
      },
    );
  });
  return app;
}
