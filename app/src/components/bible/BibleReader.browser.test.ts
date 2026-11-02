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
import { page } from 'vitest/browser';

import type * as AnnotationReconcile from '../../lib/annotations/reconcile';
import {
  createReadingTab,
  getReadingTabDestination,
  readReadingTabsState,
  storeReadingTabPosition,
} from '../../lib/bible/reading-tabs';
import {
  normalizeVerseSelection,
  selectionBookRanges,
} from '../../lib/bible/selection';
import type * as BibleSource from '../../lib/bible/source';
import type * as HighlightReconcile from '../../lib/highlights/reconcile';
import { BibleReader } from './BibleReader';

const { fetchSource } = vi.hoisted(() => ({ fetchSource: vi.fn() }));
vi.mock('../../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationSource: fetchSource,
}));
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

async function renderReader(
  selection: string,
  activeReadingTabId?: string,
  loadedBookIds = ['GEN', 'EXO'],
) {
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['user', 'did'], null);
  const rootRoute = createRootRoute();
  const load = vi.fn(
    ({
      params,
    }: {
      params: { book: string; chapter: string; translation: string };
    }) => ({
      location: { bookId: params.book, chapter: Number(params.chapter) },
      manifest,
      source: sources.find((entry) => entry.bookId === params.book)!.source,
      sources: sources.filter((entry) => loadedBookIds.includes(entry.bookId)),
      translationId: params.translation,
    }),
  );
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({
      verses: normalizeVerseSelection(search.verses),
    }),
    loaderDeps: ({ search }) => ({
      bookRanges: selectionBookRanges(search.verses),
    }),
    loader: load,
    component: BibleReader,
  });
  const initialUrl = `/eng_test/GEN/1?verses=${encodeURIComponent(selection)}`;
  const history = createMemoryHistory({ initialEntries: [initialUrl] });
  if (activeReadingTabId) history.replace(initialUrl, { activeReadingTabId });
  const router = createRouter({
    routeTree: rootRoute.addChildren([readerRoute]),
    history,
  });
  await router.load();
  const container = document.createElement('div');
  const styles = document.createElement('style');
  styles.textContent = '[data-reader-chapter] { min-height: 600px; }';
  document.head.append(styles);
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
    load,
    async cleanup() {
      root.unmount();
      container.remove();
      styles.remove();
      queryClient.clear();
      await dbClient.cleanup();
    },
  };
}

describe('multi-chapter reader', () => {
  it('moves a bounded window in both directions without adding history', async () => {
    const view = await renderReader('GEN/1:1-EXO/2:1');
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const chapters = () =>
        [
          ...view.container.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ),
        ].map((element) => element.dataset.readerChapter);
      const moveTo = async (id: string, expected: string[]) => {
        const target = [
          ...view.container.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ),
        ].find((element) => element.dataset.readerChapter === id)!;
        viewport.scrollTop +=
          target.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          100;
        const before = target.getBoundingClientRect().top;
        await expect.poll(chapters).toEqual(expected);
        const after = target.getBoundingClientRect().top;
        expect(Math.abs(after - before), id).toBeLessThan(3);
      };
      const historyLength = view.router.history.length;
      const loadCount = view.load.mock.calls.length;
      expect(
        view.container.querySelector<HTMLButtonElement>(
          'button[aria-label="Previous chapter"]',
        )!.disabled,
      ).toBe(true);
      await moveTo('GEN/2', ['GEN/1', 'GEN/2', 'EXO/1']);
      await moveTo('EXO/1', ['GEN/2', 'EXO/1', 'EXO/2']);
      await moveTo('EXO/2', ['EXO/1', 'EXO/2']);
      expect(
        view.container.querySelector<HTMLButtonElement>(
          'button[aria-label="Next chapter"]',
        )!.disabled,
      ).toBe(true);
      await moveTo('EXO/1', ['GEN/2', 'EXO/1', 'EXO/2']);
      await moveTo('GEN/2', ['GEN/1', 'GEN/2', 'EXO/1']);
      expect(view.router.history.length).toBe(historyLength);
      expect(view.load).toHaveBeenCalledTimes(loadCount);
      expect(view.router.state.location.search.verses).toBe('GEN/1:1-EXO/2:1');
      expect(
        view.container.querySelectorAll('[data-selected="true"]').length,
      ).toBe(3);
    } finally {
      await view.cleanup();
    }
  });

  it('restores a scrolled tab and its original selection when revisited', async () => {
    const savedTabs = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const selection = 'GEN/1:1-EXO/2:1';
    const tab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: selection,
    });
    const view = await renderReader(selection, tab.id);
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const scrollTo = async (id: string, next: string) => {
        const target = [
          ...view.container.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ),
        ].find((element) => element.dataset.readerChapter === id)!;
        viewport.scrollTop +=
          target.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          100;
        await expect
          .poll(() =>
            view.container.querySelector(`[data-reader-chapter="${next}"]`),
          )
          .not.toBeNull();
      };
      await scrollTo('GEN/2', 'EXO/1');
      await scrollTo('EXO/1', 'EXO/2');
      await expect
        .poll(() => readReadingTabsState().tabs[0].position)
        .toEqual({
          bookId: 'EXO',
          chapter: 1,
        });
      expect(readReadingTabsState().tabs[0].verses).toBe(selection);
      await view.router.navigate({ to: '/' });
      await view.router.navigate(
        getReadingTabDestination(readReadingTabsState().tabs[0]),
      );
      await expect
        .poll(() =>
          [
            ...view.container.querySelectorAll<HTMLElement>(
              '[data-reader-chapter]',
            ),
          ].map((element) => element.dataset.readerChapter),
        )
        .toEqual(['GEN/2', 'EXO/1', 'EXO/2']);
      expect(view.router.state.location.search.verses).toBe(selection);
      expect(view.router.state.location.state.readingPosition).toEqual({
        bookId: 'EXO',
        chapter: 1,
      });
    } finally {
      await view.cleanup();
      if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', savedTabs);
    }
  });

  it('adds a history entry for an explicit location change', async () => {
    const view = await renderReader('');
    try {
      const historyLength = view.router.history.length;
      await page.getByRole('button', { name: 'Genesis, Chapter 1' }).click();
      await page.getByRole('button', { name: 'Exodus', exact: true }).click();
      await page.getByRole('button', { name: '2', exact: true }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/EXO/2');
      expect(view.router.history.length).toBe(historyLength + 1);
    } finally {
      await view.cleanup();
    }
  });

  it('can explicitly return to the route chapter after scrolling away', async () => {
    const view = await renderReader('');
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const target = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/2"]',
      )!;
      viewport.scrollTop +=
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        100;
      await expect
        .poll(() =>
          view.container.querySelector('[data-reader-chapter="EXO/1"]'),
        )
        .not.toBeNull();
      const historyLength = view.router.history.length;
      await page.getByRole('button', { name: 'Genesis, Chapter 2' }).click();
      await page.getByRole('button', { name: '1', exact: true }).click();
      await expect
        .poll(() =>
          view.container.querySelector('[aria-label="Genesis, Chapter 1"]'),
        )
        .not.toBeNull();
      expect(view.router.history.length).toBe(historyLength + 1);
      view.router.history.back();
      await expect
        .poll(() =>
          view.container.querySelector('[aria-label="Genesis, Chapter 2"]'),
        )
        .not.toBeNull();
      view.router.history.forward();
      await expect
        .poll(() =>
          view.container.querySelector('[aria-label="Genesis, Chapter 1"]'),
        )
        .not.toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  it('keeps an annotation draft open while scrolling across chapters', async () => {
    const view = await renderReader('1-1');
    try {
      view.container.style.height = '800px';
      expect(
        view.container.querySelector('[data-selected="true"]'),
      ).not.toBeNull();
      expect(
        view.container.querySelector('[aria-label="Add annotation"]'),
      ).not.toBeNull();
      await page.getByRole('button', { name: 'Add annotation' }).click();
      await page.getByRole('textbox', { name: 'Comment' }).fill('A draft note');
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const target = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/2"]',
      )!;
      viewport.scrollTop +=
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        100;
      await expect
        .poll(() =>
          view.container.querySelector('[data-reader-chapter="EXO/1"]'),
        )
        .not.toBeNull();
      await expect
        .element(page.getByRole('textbox', { name: 'Comment' }))
        .toHaveValue('A draft note');
    } finally {
      await view.cleanup();
    }
  });

  it('restores a saved position on reload without requiring navigation state', async () => {
    const savedTabs = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const selection = 'GEN/1:1-EXO/2:1';
    const tab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: selection,
    });
    storeReadingTabPosition(tab.id, tab, tab.translationId, {
      bookId: 'EXO',
      chapter: 1,
    });
    const view = await renderReader(selection, tab.id);
    try {
      expect(
        [
          ...view.container.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ),
        ].map((element) => element.dataset.readerChapter),
      ).toEqual(['GEN/2', 'EXO/1', 'EXO/2']);
      expect(view.router.state.location.search.verses).toBe(selection);
    } finally {
      await view.cleanup();
      if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', savedTabs);
    }
  });

  it('reports an unavailable neighboring book and retries loading it', async () => {
    fetchSource.mockRejectedValue(new Error('Unavailable'));
    const view = await renderReader('', undefined, ['GEN']);
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const target = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/2"]',
      )!;
      viewport.scrollTop +=
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        100;
      await expect
        .poll(
          () =>
            view.container.querySelector(
              '[data-reader-chapter="EXO/1"] [role="alert"]',
            ),
          { timeout: 5000 },
        )
        .not.toBeNull();
      fetchSource.mockResolvedValue(sources[1].source);
      view.container
        .querySelector<HTMLButtonElement>(
          '[data-reader-chapter="EXO/1"] [role="alert"] button',
        )!
        .click();
      await expect
        .poll(() => view.container.querySelector('[data-verse-id="EXO/1:1"]'))
        .not.toBeNull();
    } finally {
      fetchSource.mockReset();
      await view.cleanup();
    }
  });

  it('starts with the active chapter and one adjacent chapter', async () => {
    const view = await renderReader('EXO/1:1,GEN/1:1-2:1');
    try {
      const chapters = [
        ...view.container.querySelectorAll('[data-reader-chapter]'),
      ];
      expect(
        chapters.map((chapter) => chapter.getAttribute('data-reader-chapter')),
      ).toEqual(['GEN/1', 'GEN/2']);
      expect(
        [...view.container.querySelectorAll('[data-reader-chapter] > h2')].map(
          (heading) => heading.textContent,
        ),
      ).toEqual([]);
      expect(
        view.container.querySelectorAll('[data-selected="true"]').length,
      ).toBe(2);
    } finally {
      await view.cleanup();
    }
  });

  it.each([
    ['Previous chapter', '/eng_test/GEN/1'],
    ['Next chapter', '/eng_test/EXO/1'],
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
        const target = chapters[1];
        viewport.scrollTop +=
          target.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          100;
        expect(target.getBoundingClientRect().top).toBeLessThan(
          viewport.getBoundingClientRect().bottom,
        );
        await expect
          .poll(() =>
            view.container.querySelector('[data-reader-chapter="EXO/1"]'),
          )
          .not.toBeNull();
        view.container
          .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
          .click();
        await expect
          .poll(() => view.router.state.location.pathname)
          .toBe(destination);
        await expect
          .poll(() => view.router.state.location.search.verses)
          .toBe('');
      } finally {
        await view.cleanup();
      }
    },
  );

  it.each([
    ['GEN/2:1', 'GEN/2', 'EXO/1'],
    ['EXO/1:1', 'EXO/1', 'EXO/2'],
  ])(
    'selects %s without moving or remounting the reader',
    async (verseId, chapterId, nextChapter) => {
      const view = await renderReader('');
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      try {
        const viewport = view.container.querySelector<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        )!;
        viewport.style.height = '300px';
        for (const id of chapterId === 'EXO/1'
          ? ['GEN/2', chapterId]
          : [chapterId]) {
          const target = view.container.querySelector<HTMLElement>(
            `[data-reader-chapter="${id}"]`,
          )!;
          viewport.scrollTop +=
            target.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top -
            30;
          await expect
            .poll(() =>
              view.container.querySelector(
                `[data-reader-chapter="${id === 'GEN/2' ? 'EXO/1' : nextChapter}"]`,
              ),
            )
            .not.toBeNull();
        }
        const verse = view.container.querySelector<HTMLElement>(
          `[data-verse-id="${verseId}"]`,
        )!;
        const before = verse.getBoundingClientRect().top;
        scrollIntoView.mockClear();
        verse.click();
        await expect
          .poll(() => view.router.state.location.search.verses)
          .toBe(verseId);
        await expect
          .poll(() => verse.getAttribute('data-selected'))
          .toBe('true');
        expect(view.router.state.location.pathname).toBe('/eng_test/GEN/1');
        expect(
          view.container.querySelector(`[data-verse-id="${verseId}"]`),
        ).toBe(verse);
        expect(
          Math.abs(verse.getBoundingClientRect().top - before),
        ).toBeLessThan(3);
        expect(scrollIntoView).not.toHaveBeenCalled();
      } finally {
        scrollIntoView.mockRestore();
        await view.cleanup();
      }
    },
  );

  it('scrolls to an initially selected verse but not subsequent selections', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const view = await renderReader('1-1');
    try {
      const verse = view.container.querySelector<HTMLElement>(
        '[data-verse-id="GEN/1:1"]',
      )!;
      expect(scrollIntoView.mock.contexts).toContain(verse);
      scrollIntoView.mockClear();
      verse.click();
      await expect
        .poll(() => view.router.state.location.search.verses)
        .toBe('');
      verse.click();
      await expect.poll(() => verse.getAttribute('data-selected')).toBe('true');
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      scrollIntoView.mockRestore();
      await view.cleanup();
    }
  });
});
