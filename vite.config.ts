import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { devtools } from '@tanstack/devtools-vite';
import { createProxyServer } from 'http-proxy-3';
import { ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { getOAuthClientMetadata } from './src/lib/atproto/client-metadata';

import babel from '@rolldown/plugin-babel';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';

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
    name: 'margins-happyview-proxy',
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

function oauthMetadataPlugin(appUrl: string): Plugin {
  const metadata = JSON.stringify(getOAuthClientMetadata(appUrl), null, 2);

  return {
    name: 'margins-oauth-client-metadata',
    configureServer(server) {
      server.middlewares.use(
        '/oauth-client-metadata.json',
        (_request, response) => {
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.setHeader('cache-control', 'public, max-age=300');
          response.end(metadata);
        },
      );
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'oauth-client-metadata.json',
        source: metadata,
      });
    },
  };
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['APP_URL', 'HAPPYVIEW_']);
  const happyViewUpstream = env.HAPPYVIEW_UPSTREAM || 'http://127.0.0.1:3001';
  const appUrl =
    env.APP_URL ||
    (mode === 'development'
      ? 'http://127.0.0.1:7654'
      : 'https://marginsbible.com');

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      tanstackRouter(),
      mode === 'development'
        ? happyViewProxyPlugin(happyViewUpstream)
        : undefined,
      oauthMetadataPlugin(appUrl),
      devtools(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        strategy: ['url', 'baseLocale'],
      }),
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
      VitePWA({
        outDir: 'dist',
        injectRegister: 'script',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: '/',
          name: 'Margins Bible',
          short_name: 'Margins',
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
          globPatterns: [
            'index.html',
            'registerSW.js',
            'assets/**/*.{js,css,woff,woff2}',
          ],
          navigateFallback: '/index.html',
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
