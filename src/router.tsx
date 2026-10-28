import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { routerWithDbClient } from '@tanstack/react-router-with-db';
import { getContext } from './integrations/tanstack-query/root-provider';
import { initializeTranslations } from './queries/translations';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const context = getContext();
  initializeTranslations(context.queryClient);

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    scrollToTopSelectors: [
      '[data-reader-scroll-area] [data-scroll-direction="vertical"]',
    ],
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return routerWithDbClient(router, context.dbClient);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

declare module '@tanstack/react-router' {
  interface HistoryState {
    activeReadingTabId?: string;
    skipHomeRestore?: boolean;
  }
}
