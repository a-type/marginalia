import { TanStackDevtools } from '@tanstack/react-devtools';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';

import { getLocale } from '#/paraglide/runtime';

import { Provider } from '@a-type/ui';
import type { DbClient } from '@tanstack/react-db';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { AnnotationSyncCoordinator } from '../components/annotations/AnnotationSyncCoordinator';
import { initializeAnnotationStorage } from '../lib/annotations/indexeddb';

interface MyRouterContext {
  dbClient: DbClient;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    // Other redirect strategies are possible; see
    // https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#offline-redirect
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', getLocale());
      await initializeAnnotationStorage();
    }
  },

  component: RootRoute,
});

function RootRoute() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Provider>
        <AnnotationSyncCoordinator />
        <Outlet />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
      </Provider>
    </QueryClientProvider>
  );
}
