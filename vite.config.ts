import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// GitHub Pages serves the app from /CocoaAir/, so that build uses relative paths.
export default defineConfig({
  base: process.env.PAGES ? './' : '/',
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
