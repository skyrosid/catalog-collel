import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '@catalog/contracts';

const bridge: DesktopApi = {
  listBooks: (collelId, query) => ipcRenderer.invoke('books:list', { collelId, query }),
  getBook: (collelId, id) => ipcRenderer.invoke('books:read', { collelId, id }),
  createBook: (collelId, input) => ipcRenderer.invoke('books:create', { collelId, input }),
  updateBook: (collelId, id, input) => ipcRenderer.invoke('books:update', { collelId, id, input }),
  deleteBook: (collelId, book) => ipcRenderer.invoke('books:delete', { collelId, book }),
  moveBooks: (collelId, input) => ipcRenderer.invoke('books:move', { collelId, input }),
  bulkBooks: (collelId, input) => ipcRenderer.invoke('books:bulk', { collelId, input }),
  importBooks: (collelId, books) => ipcRenderer.invoke('books:import', { collelId, books }),
  chooseBookImport: (collelId) => ipcRenderer.invoke('books:choose-import', collelId),
  saveBookTemplate: (collelId) => ipcRenderer.invoke('books:template', collelId),
  login: (input) => ipcRenderer.invoke('auth:login', input),
  activate: (input) => ipcRenderer.invoke('catalog:activate', input),
  deactivate: () => ipcRenderer.invoke('catalog:deactivate'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  session: () => ipcRenderer.invoke('auth:session'),
  collel: (id) => ipcRenderer.invoke('collel:read', id),
  setupStatus: () => ipcRenderer.invoke('platform:setup-status'),
  setup: (input) => ipcRenderer.invoke('platform:setup', input),
  platformLogin: (input) => ipcRenderer.invoke('platform:login', input),
  changePassword: (input) => ipcRenderer.invoke('auth:password', input),
  listCollels: (query) => ipcRenderer.invoke('platform:list', query),
  createCollel: (input) => ipcRenderer.invoke('platform:create', input),
  updateCollel: (id, input) => ipcRenderer.invoke('platform:update', { id, input }),
  deleteCollel: (id, input) => ipcRenderer.invoke('platform:delete', { id, input }),
  resetCollelAdmin: (id) => ipcRenderer.invoke('platform:reset-admin', id),
  resetCollelAccess: (id) => ipcRenderer.invoke('platform:reset-access', id),
};
contextBridge.exposeInMainWorld('catalog', Object.freeze(bridge));
