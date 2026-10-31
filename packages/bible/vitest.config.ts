import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/**/*.test.ts',
            'scripts/**/*.test.mjs',
            'indexer/**/*.test.ts',
          ],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
    ],
  },
});
