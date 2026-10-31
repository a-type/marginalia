import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node24',
    outDir: 'dist-indexer',
    emptyOutDir: true,
    lib: {
      entry: {
        server: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
        rebuild: fileURLToPath(
          new URL('./src/rebuild-main.ts', import.meta.url),
        ),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      platform: 'node',
      external: [/^node:/],
    },
  },
});
