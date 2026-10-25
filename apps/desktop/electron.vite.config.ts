import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'API_');
  const apiUrl = env.API_BASE_URL || 'http://127.0.0.1:3000';
  return {
    main: {
      define: { __API_BASE_URL__: JSON.stringify(apiUrl) },
      build: {
        externalizeDeps: false,
        rollupOptions: { external: ['electron-updater'] },
      },
    },
    preload: {
      build: {
        externalizeDeps: false,
        rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
      },
    },
    renderer: {
      resolve: { alias: { '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)) } },
      plugins: [react(), tailwindcss()],
      server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        headers: {
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5173; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      },
    },
  };
});
