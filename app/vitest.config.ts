import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { include: ['fflate'] },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-dev-runtime',
            'valtio',
            '@a-type/ui',
            '@tanstack/react-db',
            '@tanstack/react-query',
            '@atproto/lex',
            '@atproto/common-web',
            '@atproto/syntax',
            '@happyview/lex-agent',
            '@happyview/oauth-client-browser',
            'zod',
          ],
        },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
