import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { devtools } from '@tanstack/devtools-vite';
import { createProxyServer } from 'http-proxy-3';
import { ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import babel from '@rolldown/plugin-babel';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';

function getHappyViewProxyPath(url: string | undefined) {
  if (!url) return undefined;

  const queryStart = url.indexOf('?');
  const pathname = queryStart === -1 ? url : url.slice(0, queryStart);

  if (pathname === '/api' || pathname.startsWith('/api/')) return url;
  if (pathname === '/xrpc' || pathname.startsWith('/xrpc/'))
    return `/api${url}`;
  return undefined;
}

function happyViewProxyPlugin(target: string) {
  return {
    name: 'apostil-happyview-proxy',
    enforce: 'pre' as const,
    configureServer(server: ViteDevServer) {
      // Preserve the public Host header used to sign HappyView's DPoP htu.
      const proxy = createProxyServer({ changeOrigin: false, ws: true });

      proxy.on('error', (error, request, response) => {
        const pathname = request.url?.split('?')[0] ?? '/';
        console.error(
          `HappyView dev proxy failed for ${request.method} ${pathname}: ${error.message}`,
        );

        if (response instanceof ServerResponse) {
          if (response.headersSent) {
            response.destroy(error);
          } else {
            response.writeHead(502, {
              'content-type': 'text/plain; charset=utf-8',
            });
            response.end('HappyView proxy failed');
          }
        } else {
          response.destroy(error);
        }
      });

      server.middlewares.use((request, response, next) => {
        const proxyPath = getHappyViewProxyPath(request.url);
        if (!proxyPath) {
          next();
          return;
        }

        request.url = proxyPath;
        proxy.web(request, response, { target });
      });

      server.httpServer?.on('upgrade', (request, socket, head) => {
        const proxyPath = getHappyViewProxyPath(request.url);
        if (!proxyPath) return;

        request.url = proxyPath;
        proxy.ws(request, socket, head, { target });
      });
    },
  };
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['APP_URL', 'HAPPYVIEW_']);
  const happyViewUpstream = env.HAPPYVIEW_UPSTREAM || 'http://127.0.0.1:3001';

  if (mode === 'development' && env.APP_URL && !process.env.APP_URL) {
    process.env.APP_URL = env.APP_URL;
  }

  return {
    resolve: { tsconfigPaths: true },
    ssr: { noExternal: ['@a-type/ui'] },
    plugins: [
      // TanStack Start's SSR middleware runs before Vite's built-in proxy.
      mode === 'development'
        ? happyViewProxyPlugin(happyViewUpstream)
        : undefined,
      devtools(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        strategy: ['url', 'baseLocale'],
      }),
      nitro({ rollupConfig: { external: [/^@sentry\//] } }),
      tanstackStart(),
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
      VitePWA({
        outDir: '.output/public',
        injectRegister: 'script',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: '/',
          name: 'Apostil Bible',
          short_name: 'Apostil',
          description: 'A Bible reader with decentralized social commentary.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['assets/**/*.{js,css,woff,woff2}'],
          // Start renders HTML on the server; there is no static app shell.
          navigateFallback: null,
        },
      }),
    ],
    server: {
      port: 7654,
      host: '127.0.0.1',
    },
  };
});

export default config;
