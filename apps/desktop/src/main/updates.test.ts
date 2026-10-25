import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (info: { version: string }) => void>();
  return {
    listeners,
    app: { isPackaged: true, once: vi.fn() },
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) },
    updater: {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: true,
      allowDowngrade: true,
      disableWebInstaller: false,
      logger: null,
      checkForUpdates: vi.fn().mockResolvedValue(null),
      quitAndInstall: vi.fn(),
      on: vi.fn((name, listener) => {
        listeners.set(name, listener);
      }),
    },
  };
});
vi.mock('electron', () => ({ app: mocks.app, dialog: mocks.dialog }));
vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.updater } }));
import { startUpdates } from './updates.js';

const window = { isDestroyed: () => false } as unknown as BrowserWindow;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.app.isPackaged = true;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.listeners.clear();
});

describe('desktop updates', () => {
  it('does not contact GitHub in development or on unsupported platforms', async () => {
    mocks.app.isPackaged = false;
    startUpdates(() => window, 'win32');
    mocks.app.isPackaged = true;
    startUpdates(() => window, 'linux');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
  });
  it('checks at startup and periodically without installing unexpectedly', async () => {
    startUpdates(() => window, 'win32');
    expect(mocks.updater.autoInstallOnAppQuit).toBe(false);
    expect(mocks.updater.allowPrerelease).toBe(false);
    expect(mocks.updater.allowDowngrade).toBe(false);
    expect(mocks.updater.disableWebInstaller).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(2);
    mocks.listeners.get('update-downloaded')?.({ version: '0.2.0' });
    await Promise.resolve();
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    mocks.listeners.get('update-downloaded')?.({ version: '0.2.0' });
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledTimes(1);
  });
  it('installs only after the user chooses to restart', async () => {
    mocks.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    startUpdates(() => window, 'win32');
    mocks.listeners.get('update-downloaded')?.({ version: '0.3.0' });
    await Promise.resolve();
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
