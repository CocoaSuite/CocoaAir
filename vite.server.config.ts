import { defineConfig } from 'vite';

/**
 * Bundles the server into dist-server/: index.js runs it on its own (npm start, Docker),
 * embedded.js is what the desktop app starts inside itself.
 */
export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist-server',
    target: 'node20',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: { index: 'server/index.ts', embedded: 'server/embedded.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
  publicDir: false,
});
