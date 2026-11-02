import { DbClient, DbProvider } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type * as AnnotationReconcile from '../../lib/annotations/reconcile';
import { normalizeVerseSelection } from '../../lib/bible/selection';
import type * as HighlightReconcile from '../../lib/highlights/reconcile';
import { BibleReader } from './BibleReader';

vi.mock('../../lib/annotations/reconcile', async (importOriginal) => ({
  ...(await importOriginal<typeof AnnotationReconcile>()),
  reconcileChapterAnnotations: vi.fn(),
}));
vi.mock('../../lib/highlights/reconcile', async (importOriginal) => ({
  ...(await importOriginal<typeof HighlightReconcile>()),
  reconcileChapterHighlights: vi.fn(),
}));

const manifest = {
  id: 'eng_test',
  title: 'Test',
  books: [
    { id: 'GEN', title: 'Genesis', chapters: 2 },
    { id: 'EXO', title: 'Exodus', chapters: 2 },
  ],
};
const sources = [
  {
    bookId: 'GEN',
    source: '\\id GEN\n\\c 1\n\\p\n\\v 1 Beginning\n\\c 2\n\\p\n\\v 1 End',
  },
  {
    bookId: 'EXO',
    source: '\\id EXO\n\\c 1\n\\p\n\\v 1 Exodus\n\\c 2\n\\p\n\\v 1 Later',
  },
];

async function renderReader(selection: string) {
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['user', 'did'], null);
  const rootRoute = createRootRoute();
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({
      verses: normalizeVerseSelection(search.verses),
    }),
    loader: ({ params }) => ({
      location: { bookId: params.book, chapter: Number(params.chapter) },
      manifest,
      source: sources.find((entry) => entry.bookId === params.book)!.source,
      sources,
      translationId: params.translation,
    }),
    component: BibleReader,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([readerRoute]),
    history: createMemoryHistory({
      initialEntries: [
        `/eng_test/GEN/1?verses=${encodeURIComponent(selection)}`,
      ],
    }),
  });
  await router.load();
  const container = document.createElement('div');
  container.style.cssText = 'height: 300px; width: 600px';
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          DbProvider,
          { client: dbClient },
          createElement(RouterProvider, { router }),
        ),
      ),
    ),
  );
  return {
    container,
    router,
    async cleanup() {
      root.unmount();
      container.remove();
      queryClient.clear();
      await dbClient.cleanup();
    },
  };
}

describe('multi-chapter reader', () => {
  it('renders selected chapters in reading order with dividers across books', async () => {
    const view = await renderReader('EXO/1:1,GEN/1:1-2:1');
    try {
      const chapters = [
        ...view.container.querySelectorAll('[data-reader-chapter]'),
      ];
      expect(
        chapters.map((chapter) => chapter.getAttribute('data-reader-chapter')),
      ).toEqual(['GEN/1', 'GEN/2', 'EXO/1']);
      expect(
        [...view.container.querySelectorAll('[data-reader-chapter] > h2')].map(
          (heading) => heading.textContent,
        ),
      ).toEqual(['Genesis 2', 'Exodus 1']);
      expect(
        view.container.querySelectorAll('[data-selected="true"]').length,
      ).toBe(3);
    } finally {
      await view.cleanup();
    }
  });

  it.each([
    ['Previous chapter', '/eng_test/GEN/2'],
    ['Next chapter', '/eng_test/EXO/2'],
  ])(
    'uses the most visible chapter for %s and clears selection',
    async (label, destination) => {
      const view = await renderReader('GEN/1:1-EXO/1:1');
      try {
        const viewport = view.container.querySelector<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        )!;
        viewport.style.height = '300px';
        const chapters = [
          ...view.container.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ),
        ];
        chapters.forEach((chapter) => {
          chapter.style.minHeight = '600px';
        });
        const target = chapters[2];
        viewport.scrollTop = target.offsetTop + 100;
        expect(target.getBoundingClientRect().top).toBeLessThan(
          viewport.getBoundingClientRect().bottom,
        );
        view.container
          .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
          .click();
        await expect
          .poll(() => view.router.state.location.pathname)
          .toBe(destination);
        expect(view.router.state.location.search.verses).toBe('');
      } finally {
        await view.cleanup();
      }
    },
  );

  it('selects a clicked verse in another rendered chapter', async () => {
    const view = await renderReader('1:1-2:1');
    try {
      view.container
        .querySelector<HTMLElement>('[data-verse-id="GEN/2:1"]')!
        .click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/GEN/2');
      expect(view.router.state.location.search.verses).toBe('1');
    } finally {
      await view.cleanup();
    }
  });
});
