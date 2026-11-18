import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    proxy: { '/api': { target: 'http://localhost:8080', ws: true } },
  },
});
