import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { IpcMainInvokeEvent } from 'electron';
import {
  idSchema,
  loginSchema,
  setupInputSchema,
  changePasswordSchema,
  createCollelSchema,
  directoryQuerySchema,
  updateCollelRequestSchema,
  deleteCollelRequestSchema,
  bookInputSchema,
  bookReferenceSchema,
  catalogQuerySchema,
  importBooksSchema,
  moveBooksSchema,
  bulkBooksSchema,
  updateBookSchema,
} from '@catalog/contracts';
import type { Result } from '@catalog/contracts';
import { createApiClient, validateApiUrl } from './api-client.js';
import { productionCsp, rendererFile } from './security.js';
import { texts } from '../shared/texts.js';
import { startUpdates } from './updates.js';
import { createActivationStore } from './activation-store.js';
import { bookTemplate, parseBookWorkbook } from './catalog-files.js';

declare const __API_BASE_URL__: string;
const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.resolve(directory, '../renderer');
const apiOrigin = validateApiUrl(__API_BASE_URL__, app.isPackaged);
const api = createApiClient(apiOrigin, createActivationStore(apiOrigin));
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererUrl = devUrl || 'app://catalog/index.html';
const expectedOrigin = new URL(rendererUrl).origin;
let window: BrowserWindow | null = null;

app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function trusted(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  return (
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    frame &&
    frame === window.webContents.mainFrame &&
    (devUrl ? frame.origin === expectedOrigin : frame.origin === 'app://catalog')
  );
}

function handle<T>(channel: string, work: (value: unknown) => Promise<Result<T>>) {
  ipcMain.handle(channel, async (event, value: unknown): Promise<Result<T>> => {
    if (!trusted(event)) return { ok: false, error: 'FORBIDDEN' };
    try {
      return await work(value);
    } catch {
      return { ok: false, error: 'INVALID_INPUT' };
    }
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 720,
    minHeight: 600,
    title: texts.title,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(directory, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => {
    window = null;
    void api.logout();
  });
  void window.loadURL(rendererUrl);
}

void app
  .whenReady()
  .then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (event) => event.preventDefault());
    protocol.handle('app', async (request) => {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      const file = rendererFile(rendererRoot, request.url);
      if (!file) return new Response(null, { status: 403 });
      try {
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', productionCsp);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, headers });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    handle('auth:login', (value) => api.login(loginSchema.parse(value)));
    handle('catalog:activate', (value) => api.activate(loginSchema.parse(value)));
    handle('catalog:deactivate', () => api.deactivate());
    handle('auth:logout', () => api.logout());
    handle('auth:session', () => api.session());
    handle('collel:read', (value) => api.collel(idSchema.parse(value)));
    const tenant = z.strictObject({ collelId: idSchema });
    const bookRequest = tenant.extend({ id: idSchema });
    handle('books:list', (value) => {
      const input = tenant.extend({ query: catalogQuerySchema }).parse(value);
      return api.listBooks(input.collelId, input.query);
    });
    handle('books:read', (value) => {
      const input = bookRequest.parse(value);
      return api.getBook(input.collelId, input.id);
    });
    handle('books:create', (value) => {
      const input = tenant.extend({ input: bookInputSchema }).parse(value);
      return api.createBook(input.collelId, input.input);
    });
    handle('books:update', (value) => {
      const input = bookRequest.extend({ input: updateBookSchema }).parse(value);
      return api.updateBook(input.collelId, input.id, input.input);
    });
    handle('books:delete', (value) => {
      const input = tenant.extend({ book: bookReferenceSchema }).parse(value);
      return api.deleteBook(input.collelId, input.book);
    });
    handle('books:move', (value) => {
      const input = tenant.extend({ input: moveBooksSchema }).parse(value);
      return api.moveBooks(input.collelId, input.input);
    });
    handle('books:bulk', (value) => {
      const input = tenant.extend({ input: bulkBooksSchema }).parse(value);
      return api.bulkBooks(input.collelId, input.input);
    });
    handle('books:import', (value) => {
      const input = tenant.extend(importBooksSchema.shape).parse(value);
      return api.importBooks(input.collelId, input.books);
    });
    async function canManage(collelId: string): Promise<Result<null>> {
      const current = await api.session();
      if (!current.ok) return current;
      if (!current.data) return { ok: false, error: 'UNAUTHENTICATED' };
      if (
        !current.data.memberships.some(
          (member) => member.collelId === collelId && member.role === 'admin',
        )
      )
        return { ok: false, error: 'FORBIDDEN' };
      return { ok: true, data: null };
    }
    handle('books:choose-import', async (value) => {
      const collelId = idSchema.parse(value);
      const access = await canManage(collelId);
      if (!access.ok) return access;
      if (!window) return { ok: false, error: 'FORBIDDEN' };
      const chosen = await dialog.showOpenDialog(window, {
        title: texts.catalog.importTitle,
        properties: ['openFile'],
        filters: [{ name: texts.catalog.excelFile, extensions: ['xlsx'] }],
      });
      const file = chosen.filePaths[0];
      if (chosen.canceled || !file) return { ok: true, data: null };
      if ((await stat(file)).size > 5 * 1024 * 1024) return { ok: false, error: 'INVALID_INPUT' };
      return { ok: true, data: await parseBookWorkbook(await readFile(file), path.basename(file)) };
    });
    handle('books:template', async (value) => {
      const access = await canManage(idSchema.parse(value));
      if (!access.ok) return access;
      if (!window) return { ok: false, error: 'FORBIDDEN' };
      const chosen = await dialog.showSaveDialog(window, {
        title: texts.catalog.template,
        defaultPath: 'קטלוג.xlsx',
        filters: [{ name: texts.catalog.excelFile, extensions: ['xlsx'] }],
      });
      if (!chosen.canceled && chosen.filePath)
        await writeFile(chosen.filePath, Buffer.from(await bookTemplate()));
      return { ok: true, data: null };
    });
    handle('platform:setup-status', () => api.setupStatus());
    handle('platform:setup', (value) => api.setup(setupInputSchema.parse(value)));
    handle('platform:login', (value) => api.platformLogin(loginSchema.parse(value)));
    handle('auth:password', (value) => api.changePassword(changePasswordSchema.parse(value)));
    handle('platform:list', (value) => api.listCollels(directoryQuerySchema.parse(value)));
    handle('platform:create', (value) => api.createCollel(createCollelSchema.parse(value)));
    handle('platform:update', (value) => {
      const request = updateCollelRequestSchema.parse(value);
      return api.updateCollel(request.id, request.input);
    });
    handle('platform:reset-admin', (value) => api.resetCollelAdmin(idSchema.parse(value)));
    handle('platform:reset-access', (value) => api.resetCollelAccess(idSchema.parse(value)));
    handle('platform:delete', (value) => {
      const request = deleteCollelRequestSchema.parse(value);
      return api.deleteCollel(request.id, request.input);
    });
    createWindow();
    startUpdates(() => window);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch(() => {
    console.error('Desktop initialization failed.');
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
