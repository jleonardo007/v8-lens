import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(__dirname),
  resolve: {
    alias: {
      '@core': resolve(__dirname, '../../core'),
      '@cli': resolve(__dirname, '../../cli'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../../dist/dashboard'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
