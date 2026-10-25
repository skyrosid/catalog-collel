import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createActivationStore(origin: string) {
  const file = () => path.join(app.getPath('userData'), 'catalog-activation.json');
  async function requireProtectedStorage() {
    // Persistent activation is currently supported only on Windows, where
    // Electron documents DPAPI protection. Other platforms fail closed.
    if (process.platform !== 'win32' || !(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('Protected device storage is unavailable.');
    }
  }
  return {
    async load(): Promise<string | null> {
      let source: string;
      try {
        source = await readFile(file(), 'utf8');
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return null;
        throw error;
      }
      await requireProtectedStorage();
      const stored: unknown = JSON.parse(source);
      if (
        typeof stored !== 'object' ||
        stored === null ||
        !('encrypted' in stored) ||
        typeof stored.encrypted !== 'string'
      )
        throw new Error('Invalid device storage.');
      const decrypted = await safeStorage.decryptStringAsync(
        Buffer.from(stored.encrypted, 'base64'),
      );
      const value: unknown = JSON.parse(decrypted.result);
      if (
        typeof value !== 'object' ||
        value === null ||
        !('origin' in value) ||
        value.origin !== origin ||
        !('token' in value) ||
        typeof value.token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.token)
      )
        return null;
      return value.token;
    },
    async save(token: string | null) {
      if (token === null) {
        await rm(file(), { force: true });
        return;
      }
      await requireProtectedStorage();
      const encrypted = (
        await safeStorage.encryptStringAsync(JSON.stringify({ origin, token }))
      ).toString('base64');
      await mkdir(path.dirname(file()), { recursive: true });
      const temporary = `${file()}.tmp`;
      await writeFile(temporary, JSON.stringify({ encrypted }), { mode: 0o600 });
      await rename(temporary, file());
    },
  };
}
