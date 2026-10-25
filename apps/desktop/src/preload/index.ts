import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '@catalog/contracts';

const bridge: DesktopApi = {
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
  resetCollelAdmin: (id) => ipcRenderer.invoke('platform:reset-admin', id),
  resetCollelAccess: (id) => ipcRenderer.invoke('platform:reset-access', id),
};
contextBridge.exposeInMainWorld('catalog', Object.freeze(bridge));
