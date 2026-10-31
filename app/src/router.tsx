import { GlobalErrorFallback } from '@a-type/ui';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithDbClient } from '@tanstack/react-router-with-db';
import { updateApp, updateState } from './components/updates/updateState';
import { getContext } from './integrations/tanstack-query/root-provider';
import { logger } from './logger';
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
      '#page--main-content',
    ],
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: GlobalErrorFallback,
  });

  router.subscribe('onBeforeNavigate', (event) => {
    // only update on path changes
    if (updateState.updateAvailable && event.pathChanged) {
      logger.info('Update ready to install, intercepting navigation...');
      updateApp();
      return false;
    }
  });

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
