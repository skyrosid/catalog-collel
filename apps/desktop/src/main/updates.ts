import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { texts } from '../shared/texts.js';

// electron-updater is CommonJS; default import keeps the ESM main compatible.
const { autoUpdater } = electronUpdater;

export function startUpdates(getWindow: () => BrowserWindow | null, platform = process.platform) {
  if (!app.isPackaged || platform !== 'win32') return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.logger = null;
  let checking = false;
  let promptedVersion: string | undefined;

  autoUpdater.on('error', () => {
    // Offline update checks must never interrupt authentication or normal use.
    console.warn('Automatic update check or download failed.');
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (promptedVersion === info.version) return;
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    promptedVersion = info.version;
    void dialog
      .showMessageBox(window, {
        type: 'info',
        title: texts.updates.title,
        message: texts.updates.message,
        detail: texts.updates.detail,
        buttons: [texts.updates.restart, texts.updates.later],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      })
      .catch(() => {
        console.warn('Update prompt could not be displayed.');
      });
  });

  async function check() {
    if (checking) return;
    checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      /* Handled by the error event; the next scheduled check will retry. */
    } finally {
      checking = false;
    }
  }
  const initial = setTimeout(() => {
    void check();
  }, 5000);
  const recurring = setInterval(
    () => {
      void check();
    },
    6 * 60 * 60 * 1000,
  );
  initial.unref();
  recurring.unref();
  app.once('will-quit', () => {
    clearTimeout(initial);
    clearInterval(recurring);
  });
}
