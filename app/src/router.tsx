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
    scrollRestoration: ({ location }) =>
      !/^\/[^/]+\/[^/]+\/[1-9]\d*$/.test(location.pathname),
    scrollToTopSelectors: [
      // '[data-reader-scroll-area] [data-scroll-direction="vertical"]',
      '#page--main-content',
    ],
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: GlobalErrorFallback,
  });

  router.subscribe('onBeforeNavigate', (event) => {
    // only update on path changes
    if (
      updateState.updateAvailable &&
      event.pathChanged &&
      !event.toLocation.state.noUpdate
    ) {
      logger.info('Update ready to install, intercepting navigation...');
      updateApp();
      // fallback - if update stalls, retry navigation with bypass
      setTimeout(() => {
        logger.warn('Update stalled, retrying navigation with bypass...');
        try {
          router.history.replace(event.toLocation.pathname, {
            ...event.toLocation,
            state: { ...event.toLocation.state, noUpdate: true },
          });
        } catch (error) {
          logger.fatal('Failed to retry navigation with bypass:', error);
          window.location.reload();
        }
      }, 5000);
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
    noUpdate?: boolean;
    readingPosition?: { bookId: string; chapter: number };
  }
}
