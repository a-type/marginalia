import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { normalizeVerseSelection } from '../../lib/bible/selection';
import type * as BibleSource from '../../lib/bible/source';
import type * as TranslationQueries from '../../queries/translations';
import { BibleSearch } from '../search/BibleSearch';
import { useSelectTranslation } from './useSelectTranslation';

const { fetchManifest, fetchSource } = vi.hoisted(() => ({
  fetchManifest: vi.fn(),
  fetchSource: vi.fn(),
}));
vi.mock('../../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationManifest: fetchManifest,
  fetchTranslationSource: fetchSource,
}));
vi.mock('../../queries/translations', async (importOriginal) => ({
  ...(await importOriginal<typeof TranslationQueries>()),
  translationsQueryOptions: {
    queryKey: ['translations'],
    queryFn: () => [
      {
        id: 'eng_test',
        sourceStatus: 'ready',
        searchStatus: 'ready',
        manifest: {
          title: 'Test',
          books: [{ id: 'JHN', title: 'John', chapters: 3 }],
        },
      },
    ],
    staleTime: Infinity,
  },
  bibleSearchQueryOptions: () => ({
    queryKey: ['test-search'],
    queryFn: () => ({
      total: 1,
      verses: [
        { id: 'JHN/3:2', label: '2', text: 'Example verse', ranges: [] },
      ],
    }),
    staleTime: Infinity,
  }),
}));

afterEach(() => vi.clearAllMocks());

function SwitchTranslation() {
  const change = useSelectTranslation({ bookId: 'JHN', chapter: 3 });
  return createElement(
    'button',
    { onClick: () => change.mutate('eng_other') },
    'Switch',
  );
}

async function renderNavigation(initialUrl: string, home: ReactNode) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => home,
  });
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({
      verses: normalizeVerseSelection(search.verses),
    }),
    component: SwitchTranslation,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, readerRoute]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await router.load();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(RouterProvider, { router }),
      ),
    ),
  );
  return {
    router,
    cleanup() {
      root.unmount();
      container.remove();
      client.clear();
    },
  };
}

describe('selection navigation', () => {
  it('opens a search result with its full verse ID', async () => {
    const view = await renderNavigation(
      '/',
      createElement(BibleSearch, {
        initialTranslation: 'eng_test',
        isActive: true,
      }),
    );
    try {
      await page
        .getByRole('textbox', { name: 'Words or quoted phrase' })
        .fill('example');
      await page
        .getByRole('button', { name: 'John 3:2 Example verse' })
        .click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/JHN/3');
      expect(view.router.state.location.search.verses).toBe('JHN/3:2');
    } finally {
      view.cleanup();
    }
  });

  it.each([
    ['\\id JHN\n\\c 3\n\\p \\v 1 One \\v 2 Two', 'JHN/3:2'],
    ['\\id JHN\n\\c 3\n\\p \\v 1 One', ''],
  ])(
    'keeps the selected ID only when it exists in the new translation',
    async (source, expected) => {
      fetchManifest.mockResolvedValue({
        id: 'eng_other',
        title: 'Other',
        books: [{ id: 'JHN', title: 'John', chapters: 3 }],
      });
      fetchSource.mockResolvedValue(source);
      const view = await renderNavigation(
        '/eng_test/JHN/3?verses=JHN%2F3%3A2',
        null,
      );
      try {
        await page.getByRole('button', { name: 'Switch' }).click();
        await expect
          .poll(() => view.router.state.location.pathname)
          .toBe('/eng_other/JHN/3');
        expect(view.router.state.location.search.verses).toBe(expected);
      } finally {
        view.cleanup();
      }
    },
  );
});
