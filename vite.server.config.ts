import { defineConfig } from 'vite';

/** Bundles the signalling server into dist-server/index.js. */
export default defineConfig({
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    target: 'node20',
    emptyOutDir: true,
    sourcemap: false,
  },
  publicDir: false,
});
