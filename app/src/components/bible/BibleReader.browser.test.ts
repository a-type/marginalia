import { DbClient, DbProvider } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';

import type * as AnnotationReconcile from '../../lib/annotations/reconcile';
import {
  ensureAnnotationCollectionReady,
  getAnnotationCollections,
} from '../../lib/annotations/collections';
import {
  createReadingTab,
  getReadingTabDestination,
  readReadingTabsState,
  storeReadingTabScrollPosition,
} from '../../lib/bible/reading-tabs';
import {
  normalizeVerseSelection,
  selectionBookRanges,
} from '../../lib/bible/selection';
import type * as BibleSource from '../../lib/bible/source';
import type * as HighlightReconcile from '../../lib/highlights/reconcile';
import { AppNavigation } from '../app/AppNavigation';
import { BibleReader } from './BibleReader';
import { CHAPTER_BUFFER } from './useContinuousChapters';

const { fetchSource, testManifest } = vi.hoisted(() => ({
  fetchSource: vi.fn(),
  testManifest: {
    id: 'eng_test',
    title: 'Test',
    books: [
      { id: 'GEN', title: 'Genesis', chapters: 2 },
      { id: 'EXO', title: 'Exodus', chapters: 2 },
    ],
  },
}));
vi.mock('../../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationSource: fetchSource,
}));
vi.mock('../bible/useTranslationManifest', () => ({
  useTranslationManifest: () => ({ data: testManifest }),
}));
vi.mock('../../lib/annotations/reconcile', async (importOriginal) => ({
  ...(await importOriginal<typeof AnnotationReconcile>()),
  reconcileChapterAnnotations: vi.fn(),
}));
vi.mock('../../lib/highlights/reconcile', async (importOriginal) => ({
  ...(await importOriginal<typeof HighlightReconcile>()),
  reconcileChapterHighlights: vi.fn(),
}));

const manifest = testManifest;
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

function getExpectedChapterWindow(
  activeId: string,
  books: typeof manifest.books = manifest.books,
) {
  const chapterIds = books.flatMap((book) =>
    Array.from(
      { length: book.chapters },
      (_, index) => `${book.id}/${index + 1}`,
    ),
  );
  const activeIndex = chapterIds.indexOf(activeId);
  const start = Math.max(0, activeIndex - CHAPTER_BUFFER);
  const end = Math.min(chapterIds.length, activeIndex + CHAPTER_BUFFER + 1);
  return chapterIds.slice(start, end);
}

async function renderReader(
  selection: string,
  activeReadingTabId?: string,
  loadedBookIds = ['GEN', 'EXO'],
  initialPath = '/eng_test/GEN/1',
  browserHistory = false,
  fixtureStyles = '',
  readerManifest = manifest,
  withNavigation = false,
  readerSources = sources,
  initialReadingPosition?: { bookId: string; chapter: number },
) {
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['user', 'did'], null);
  const rootRoute = createRootRoute({
    ...(withNavigation
      ? {
          component: () =>
            createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                },
              },
              createElement(AppNavigation),
              createElement(
                'div',
                { style: { flex: 1, minHeight: 0 } },
                createElement(Outlet),
              ),
            ),
        }
      : {}),
  });
  let nextLoadGate: Promise<void> | undefined;
  const load = vi.fn(
    async ({
      params,
    }: {
      params: { book: string; chapter: string; translation: string };
    }) => {
      const gate = nextLoadGate;
      nextLoadGate = undefined;
      if (gate) await gate;
      return {
        location: { bookId: params.book, chapter: Number(params.chapter) },
        manifest: readerManifest,
        source: readerSources.find((entry) => entry.bookId === params.book)!
          .source,
        sources: readerSources.filter((entry) =>
          loadedBookIds.includes(entry.bookId),
        ),
        translationId: params.translation,
      };
    },
  );
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({
      verses: normalizeVerseSelection(search.verses),
      annotation:
        typeof search.annotation === 'string' ? search.annotation : undefined,
    }),
    loaderDeps: ({ search }) => ({
      bookRanges: selectionBookRanges(search.verses),
    }),
    loader: load,
    component: BibleReader,
  });
  const initialUrl = selection
    ? `${initialPath}?verses=${encodeURIComponent(selection)}`
    : initialPath;
  const previousHistory = browserHistory
    ? { href: window.location.href, state: window.history.state }
    : undefined;
  if (browserHistory) window.history.replaceState(null, '', initialUrl);
  const history = browserHistory
    ? createBrowserHistory()
    : createMemoryHistory({ initialEntries: [initialUrl] });
  if (activeReadingTabId)
    history.replace(initialUrl, {
      activeReadingTabId,
      ...(initialReadingPosition
        ? { readingPosition: initialReadingPosition }
        : {}),
    });
  const router = createRouter({
    routeTree: rootRoute.addChildren([readerRoute]),
    history,
    scrollRestoration: ({ location }) =>
      !/^\/[^/]+\/[^/]+\/[1-9]\d*$/.test(location.pathname),
    scrollToTopSelectors: [
      '[data-reader-scroll-area] [data-scroll-direction="vertical"]',
      '#page--main-content',
    ],
  });
  await router.load();
  const container = document.createElement('div');
  const styles = document.createElement('style');
  styles.textContent = `[data-reader-chapter] { min-height: 600px; } ${fixtureStyles}`;
  document.head.append(styles);
  container.style.cssText = 'height: 300px; width: 600px';
  document.body.append(container);
  const root = createRoot(container);
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe();
      resolve();
    });
  });
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
  await rendered;
  return {
    container,
    dbClient,
    router,
    load,
    deferNextLoad(gate: Promise<void>) {
      nextLoadGate = gate;
    },
    async cleanup() {
      root.unmount();
      container.remove();
      styles.remove();
      queryClient.clear();
      await dbClient.cleanup();
      if (previousHistory) {
        history.destroy();
        window.history.replaceState(
          previousHistory.state,
          '',
          previousHistory.href,
        );
      }
    },
  };
}

describe('multi-chapter reader', () => {
  it.each(['anchor', 'fallback'])(
    'keeps the chapter window fixed during scrollbar dragging (%s positioning)',
    async (positioning) => {
      const supports =
        positioning === 'fallback'
          ? vi.spyOn(CSS, 'supports').mockReturnValue(false)
          : undefined;
      const source = Promise.withResolvers<string>();
      fetchSource.mockReturnValue(source.promise);
      const view = await renderReader('', undefined, ['GEN']);
      const session = cdp();
      try {
        view.container.style.width = '280px';
        const viewport = view.container.querySelector<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        )!;
        viewport.style.height = '300px';
        await userEvent.hover(viewport);
        const track = view.container.querySelector<HTMLElement>(
          '[aria-hidden="true"][data-orientation="vertical"]',
        )!;
        await expect
          .poll(() => getComputedStyle(track).pointerEvents)
          .toBe('auto');
        const thumb = track.querySelector<HTMLElement>(
          '[data-orientation="vertical"]',
        )!;
        await expect
          .poll(() => thumb.getBoundingClientRect().height)
          .toBeGreaterThan(0);
        const trackRect = track.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        const frameRect = window.frameElement!.getBoundingClientRect();
        const x =
          frameRect.left +
          ((thumbRect.left + thumbRect.width / 2) * frameRect.width) /
            window.innerWidth;
        const y =
          frameRect.top +
          ((thumbRect.top + thumbRect.height / 2) * frameRect.height) /
            window.innerHeight;
        const endY =
          frameRect.top +
          ((trackRect.bottom - 1) * frameRect.height) / window.innerHeight;
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y,
        });
        await session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          buttons: 1,
          clickCount: 1,
        });
        await expect
          .poll(() =>
            view.container.querySelector('[data-reader-scrub-location]'),
          )
          .not.toBeNull();
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y: endY,
          button: 'left',
          buttons: 1,
        });
        await expect
          .poll(
            () =>
              view.container.querySelector('[data-reader-scrub-location]')
                ?.textContent,
          )
          .toBe('Exodus 2');
        const callout = view.container.querySelector<HTMLElement>(
          '[data-reader-scrub-location]',
        )!;
        const calloutRect = callout.getBoundingClientRect();
        const currentThumbRect = thumb.getBoundingClientRect();
        expect(calloutRect.right).toBeLessThanOrEqual(currentThumbRect.left);
        expect(calloutRect.top).toBeGreaterThanOrEqual(trackRect.top - 1);
        expect(calloutRect.bottom).toBeLessThanOrEqual(trackRect.bottom + 1);
        expect(
          [
            ...view.container.querySelectorAll<HTMLElement>(
              '[data-reader-chapter]',
            ),
          ].map((chapter) => chapter.dataset.readerChapter),
        ).toEqual(getExpectedChapterWindow('GEN/1'));
        expect(view.router.history.location.pathname).toBe('/eng_test/GEN/1');
        const scrollHeight = viewport.scrollHeight;
        source.resolve(sources[1].source);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        expect(viewport.scrollHeight).toBe(scrollHeight);
        expect(
          view.container.querySelector(
            '[data-reader-chapter="EXO/1"] [role="status"]',
          ),
        ).not.toBeNull();
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y: endY,
          button: 'left',
          buttons: 0,
          clickCount: 1,
        });
        await expect
          .poll(() => view.router.history.location.pathname)
          .toBe('/eng_test/EXO/2');
        await expect
          .poll(() => view.container.querySelector('[data-verse-id="EXO/2:1"]'))
          .not.toBeNull();
        await expect
          .poll(() => {
            const chapter = view.container.querySelector<HTMLElement>(
              '[data-reader-chapter="EXO/2"]',
            )!;
            return Math.abs(
              chapter.getBoundingClientRect().top -
                viewport.getBoundingClientRect().top,
            );
          })
          .toBeLessThan(2);
        expect(
          view.container.querySelector('[data-reader-scrub-location]'),
        ).toBeNull();

        const startY =
          frameRect.top +
          ((track.getBoundingClientRect().top + 1) * frameRect.height) /
            window.innerHeight;
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y: startY,
        });
        await session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y: startY,
          button: 'left',
          buttons: 1,
          clickCount: 1,
        });
        await expect
          .poll(
            () =>
              view.container.querySelector('[data-reader-scrub-location]')
                ?.textContent,
          )
          .toBe('Genesis 1');
        expect(view.router.history.location.pathname).toBe('/eng_test/EXO/2');
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y: startY,
          button: 'left',
          buttons: 0,
          clickCount: 1,
        });
        await expect
          .poll(() => view.router.history.location.pathname)
          .toBe('/eng_test/GEN/1');
        await expect
          .poll(() => {
            const chapter = view.container.querySelector<HTMLElement>(
              '[data-reader-chapter="GEN/1"]',
            )!;
            return Math.abs(
              chapter.getBoundingClientRect().top -
                viewport.getBoundingClientRect().top,
            );
          })
          .toBeLessThan(2);
      } finally {
        supports?.mockRestore();
        fetchSource.mockReset();
        await view.cleanup();
      }
    },
  );

  it('keeps the selected chapter at the top as its source loads after scrubbing', async () => {
    const source = Promise.withResolvers<string>();
    fetchSource.mockReturnValue(source.promise);
    const view = await renderReader('', undefined, ['GEN']);
    try {
      view.container.style.width = '280px';
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      await userEvent.hover(viewport);
      const track = view.container.querySelector<HTMLElement>(
        '[aria-hidden="true"][data-orientation="vertical"]',
      )!;
      await expect
        .poll(() => getComputedStyle(track).pointerEvents)
        .toBe('auto');
      const thumb = track.querySelector<HTMLElement>(
        '[data-orientation="vertical"]',
      )!;
      await expect
        .poll(() => thumb.getBoundingClientRect().height)
        .toBeGreaterThan(0);
      const thumbRect = thumb.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const frameRect = window.frameElement!.getBoundingClientRect();
      const x =
        frameRect.left +
        ((thumbRect.left + thumbRect.width / 2) * frameRect.width) /
          window.innerWidth;
      const startY =
        frameRect.top +
        ((thumbRect.top + thumbRect.height / 2) * frameRect.height) /
          window.innerHeight;
      const endY =
        frameRect.top +
        ((trackRect.bottom - 1) * frameRect.height) / window.innerHeight;
      const session = cdp();
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y: startY,
      });
      await session.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y: startY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y: endY,
        button: 'left',
        buttons: 1,
      });
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y: endY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      const chapterTopOffset = () => {
        const chapter = view.container.querySelector<HTMLElement>(
          '[data-reader-chapter="EXO/2"]',
        );
        return chapter
          ? Math.abs(
              chapter.getBoundingClientRect().top -
                viewport.getBoundingClientRect().top,
            )
          : Infinity;
      };
      await expect.poll(chapterTopOffset).toBeLessThan(2);
      expect(
        view.container.querySelector(
          '[data-reader-chapter="EXO/2"] [role="status"]',
        ),
      ).not.toBeNull();
      source.resolve(sources[1].source);
      await expect
        .poll(() => view.container.querySelector('[data-verse-id="EXO/2:1"]'))
        .not.toBeNull();
      await expect.poll(chapterTopOffset).toBeLessThan(2);
    } finally {
      fetchSource.mockReset();
      await view.cleanup();
    }
  });

  // chapter prev/next buttons were removed, may be restored later. this was their behavior.
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
      const moveTo = async (id: string) => {
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
        await expect.poll(chapters).toEqual(getExpectedChapterWindow(id));
        await expect
          .poll(() => view.router.history.location.pathname)
          .toBe(`/eng_test/${id}`);
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
      await moveTo('GEN/2');
      await moveTo('EXO/1');
      await moveTo('EXO/2');
      expect(
        view.container.querySelector<HTMLButtonElement>(
          'button[aria-label="Next chapter"]',
        )!.disabled,
      ).toBe(true);
      await moveTo('EXO/1');
      await moveTo('GEN/2');
      expect(view.router.history.length).toBe(historyLength);
      expect(view.load.mock.calls.length - loadCount).toBeLessThanOrEqual(5);
      expect(view.router.state.location.search.verses).toBe('GEN/1:1-EXO/2:1');
      expect(view.router.state.location.maskedLocation?.search.verses).toBe(
        'GEN/1:1-EXO/2:1',
      );
      expect(
        view.container.querySelectorAll('[data-selected="true"]').length,
      ).toBe(4);
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
        .toEqual(getExpectedChapterWindow('EXO/1'));
      expect(view.router.state.location.search.verses).toBe(selection);
      expect(view.router.state.location.maskedLocation?.pathname).toBe(
        '/eng_test/EXO/1',
      );
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
      const bookInput = page.getByRole('textbox', { name: 'Book' });
      await bookInput.click();
      await userEvent.keyboard('EXO');
      await page.getByRole('option', { name: /Exodus/ }).click();
      expect(view.router.state.location.pathname).toBe('/eng_test/GEN/1');
      await expect
        .poll(() => document.activeElement?.getAttribute('aria-label'))
        .toBe('Chapter');
      await expect
        .poll(() => document.activeElement?.getAttribute('type'))
        .toBe('number');
      await page.getByRole('option', { name: '2', exact: true }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/EXO/2');
      expect(view.router.history.length).toBe(historyLength + 1);
    } finally {
      await view.cleanup();
    }
  });

  it.each([
    { book: 'Exodus', bookQuery: 'EXO', chapter: 2, path: '/eng_test/EXO/2' },
    {
      book: 'Genesis',
      bookQuery: undefined,
      chapter: 2,
      path: '/eng_test/GEN/2',
    },
  ])(
    'retains the selected location while $book $chapter is loading',
    async ({ book, bookQuery, chapter, path }) => {
      const view = await renderReader('');
      const loadGate = Promise.withResolvers<void>();
      try {
        const loadCount = view.load.mock.calls.length;
        view.deferNextLoad(loadGate.promise);
        if (bookQuery) {
          await page.getByRole('textbox', { name: 'Book' }).click();
          await userEvent.keyboard(bookQuery);
          await page.getByRole('option', { name: book }).click();
        } else {
          await page.getByRole('spinbutton', { name: 'Chapter' }).click();
        }
        await page
          .getByRole('option', { name: String(chapter), exact: true })
          .click();
        await expect
          .poll(() => view.load.mock.calls.length)
          .toBeGreaterThan(loadCount);
        expect(
          view.container.querySelector('[data-reader-chapter="GEN/1"]'),
        ).not.toBeNull();
        await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
          book,
        );
        await expect(
          page.getByRole('spinbutton', { name: 'Chapter' }),
        ).toHaveValue(chapter);

        loadGate.resolve();
        await expect.poll(() => view.router.state.location.pathname).toBe(path);
        await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
          book,
        );
        await expect(
          page.getByRole('spinbutton', { name: 'Chapter' }),
        ).toHaveValue(chapter);
      } finally {
        loadGate.resolve();
        await view.cleanup();
      }
    },
  );

  it('keeps the latest selection when a pending location is superseded', async () => {
    const view = await renderReader('');
    const loadGate = Promise.withResolvers<void>();
    try {
      const loadCount = view.load.mock.calls.length;
      view.deferNextLoad(loadGate.promise);
      await page.getByRole('textbox', { name: 'Book' }).click();
      await userEvent.keyboard('EXO');
      await page.getByRole('option', { name: 'Exodus' }).click();
      await page.getByRole('option', { name: '2', exact: true }).click();
      await expect
        .poll(() => view.load.mock.calls.length)
        .toBeGreaterThan(loadCount);
      await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
        'Exodus',
      );

      await page.getByRole('textbox', { name: 'Book' }).click();
      await userEvent.keyboard('GEN');
      await page.getByRole('option', { name: 'Genesis' }).click();
      await page.getByRole('option', { name: '2', exact: true }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/GEN/2');
      loadGate.resolve();
      await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
        'Genesis',
      );
      await expect(
        page.getByRole('spinbutton', { name: 'Chapter' }),
      ).toHaveValue(2);
      expect(view.router.state.location.pathname).toBe('/eng_test/GEN/2');
    } finally {
      loadGate.resolve();
      await view.cleanup();
    }
  });

  it('discards a pending book selection when the reading location changes', async () => {
    const view = await renderReader('');
    try {
      await page.getByRole('textbox', { name: 'Book' }).click();
      await userEvent.keyboard('EXO');
      await page.getByRole('option', { name: /Exodus/ }).click();
      await userEvent.keyboard('{Escape}');
      await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
        'Exodus',
      );

      await page.getByRole('button', { name: 'Next chapter' }).click();
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
        'Genesis',
      );
      await expect(
        page.getByRole('spinbutton', { name: 'Chapter' }),
      ).toHaveValue(2);
    } finally {
      await view.cleanup();
    }
  });

  it('shows recent translations by name and opens translation management', async () => {
    const savedRecentTranslations = localStorage.getItem(
      'margins:recent-translations',
    );
    localStorage.setItem(
      'margins:recent-translations',
      JSON.stringify([
        { id: 'eng_kjv', title: 'King James Version' },
        { id: 'eng_msb', title: 'Majority Standard Bible' },
      ]),
    );
    const view = await renderReader('');
    try {
      const translationInput = page.getByRole('combobox', {
        name: 'Translation',
      });
      await expect(translationInput).toHaveTextContent('TES');
      await translationInput.click();
      await expect(page.getByRole('option', { name: 'Test' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        page.getByRole('option', { name: 'King James Version' }),
      ).toBeVisible();
      await page.getByRole('option', { name: 'More', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Translations' }),
      ).toBeVisible();
    } finally {
      await view.cleanup();
      if (savedRecentTranslations === null)
        localStorage.removeItem('margins:recent-translations');
      else
        localStorage.setItem(
          'margins:recent-translations',
          savedRecentTranslations,
        );
    }
  });

  it('shows a directly selected chapter after a large preceding scroll buffer', async () => {
    const view = await renderReader(
      '',
      undefined,
      undefined,
      undefined,
      false,
      '',
      {
        ...manifest,
        books: [
          { id: 'GEN', title: 'Genesis', chapters: 50 },
          { id: 'EXO', title: 'Exodus', chapters: 2 },
        ],
      },
    );
    try {
      const chapterIsVisible = (id: string) => {
        const viewport = view.container.querySelector<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        );
        const chapter = view.container.querySelector<HTMLElement>(
          `[data-reader-chapter="${id}"]`,
        );
        if (!viewport || !chapter?.querySelector('[data-verse-id]'))
          return false;
        const bounds = viewport.getBoundingClientRect();
        const chapterBounds = chapter.getBoundingClientRect();
        return (
          chapterBounds.top < bounds.bottom && chapterBounds.bottom > bounds.top
        );
      };
      const bookInput = page.getByRole('textbox', { name: 'Book' });
      await bookInput.click();
      await userEvent.keyboard('EXO');
      await page.getByRole('option', { name: /Exodus/ }).click();
      await page.getByRole('option', { name: '2', exact: true }).click();
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/EXO/2');
      await expect.poll(() => chapterIsVisible('EXO/2')).toBe(true);
      view.router.history.back();
      await expect.poll(() => chapterIsVisible('GEN/1')).toBe(true);
      view.router.history.forward();
      await expect.poll(() => chapterIsVisible('EXO/2')).toBe(true);
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
      await page.getByRole('spinbutton', { name: 'Chapter' }).click();
      await page.getByRole('option', { name: '1', exact: true }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/GEN/1');
      expect(view.router.history.length).toBe(historyLength + 1);
      view.router.history.back();
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      view.router.history.forward();
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/1');
    } finally {
      await view.cleanup();
    }
  });

  it('keeps an annotation draft open while scrolling across chapters', async () => {
    const view = await renderReader('GEN/1:1');
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
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      await expect
        .element(page.getByRole('textbox', { name: 'Comment' }))
        .toHaveValue('A draft note');
    } finally {
      await view.cleanup();
    }
  });

  it('restores the saved position on reload instead of stale route state', async () => {
    const savedTabs = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const selection = 'GEN/1:1-EXO/2:1';
    const tab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: selection,
    });
    storeReadingTabScrollPosition(
      tab.id,
      tab,
      tab.translationId,
      { bookId: 'EXO', chapter: 1 },
      0.2,
    );
    const view = await renderReader(
      selection,
      tab.id,
      ['GEN', 'EXO'],
      '/eng_test/GEN/1',
      false,
      '',
      manifest,
      false,
      sources,
      { bookId: 'GEN', chapter: 2 },
    );
    try {
      expect(
        [
          ...view.container.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ),
        ].map((element) => element.dataset.readerChapter),
      ).toEqual(getExpectedChapterWindow('EXO/1'));
      expect(view.router.state.location.search.verses).toBe(selection);
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="EXO/1"]',
      )!;
      await expect
        .poll(
          () =>
            viewport.getBoundingClientRect().top -
            chapter.getBoundingClientRect().top,
        )
        .toBeCloseTo(chapter.getBoundingClientRect().height * 0.2, 0);
    } finally {
      await view.cleanup();
      if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', savedTabs);
    }
  });

  it('does not sync a tab reading position until its restored chapter is loaded', async () => {
    const savedTabs = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const source = Promise.withResolvers<string>();
    fetchSource.mockReturnValue(source.promise);
    const tab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
    });
    storeReadingTabScrollPosition(
      tab.id,
      tab,
      tab.translationId,
      { bookId: 'EXO', chapter: 1 },
      0,
    );
    const view = await renderReader(
      '',
      tab.id,
      ['GEN'],
      '/eng_test/GEN/1',
      false,
      '',
      manifest,
      false,
      sources,
      { bookId: 'GEN', chapter: 2 },
    );
    try {
      expect(view.router.state.location.maskedLocation).toBeUndefined();
      expect(readReadingTabsState().tabs[0].position).toEqual({
        bookId: 'EXO',
        chapter: 1,
      });

      source.resolve(sources[1].source);
      await expect
        .poll(() => view.router.state.location.maskedLocation?.pathname)
        .toBe('/eng_test/EXO/1');
      expect(view.router.state.location.maskedLocation?.pathname).toBe(
        '/eng_test/EXO/1',
      );
    } finally {
      fetchSource.mockReset();
      await view.cleanup();
      if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', savedTabs);
    }
  });

  it('reserves a screen of space for an unloaded chapter', async () => {
    const source = Promise.withResolvers<string>();
    fetchSource.mockReturnValue(source.promise);
    const view = await renderReader(
      '',
      undefined,
      ['GEN'],
      undefined,
      false,
      '[data-reader-chapter] { min-height: 0; }',
    );
    try {
      const placeholder = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="EXO/1"] [role="status"]',
      )!;
      expect(placeholder.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        window.innerHeight,
      );
      source.resolve(sources[1].source);
      await expect
        .poll(() => view.container.querySelector('[data-verse-id="EXO/1:1"]'))
        .not.toBeNull();
      expect(
        view.container.querySelector(
          '[data-reader-chapter="EXO/1"] [role="status"]',
        ),
      ).toBeNull();
    } finally {
      fetchSource.mockReset();
      await view.cleanup();
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

  it('starts with the active chapter and its buffered neighbors', async () => {
    const view = await renderReader('EXO/1:1,GEN/1:1-GEN/2:1');
    try {
      const chapters = [
        ...view.container.querySelectorAll('[data-reader-chapter]'),
      ];
      expect(
        chapters.map((chapter) => chapter.getAttribute('data-reader-chapter')),
      ).toEqual(getExpectedChapterWindow('GEN/1'));
      expect(
        [...view.container.querySelectorAll('[data-reader-chapter] > h2')].map(
          (heading) => heading.textContent,
        ),
      ).toEqual([]);
      expect(
        view.container.querySelectorAll('[data-selected="true"]').length,
      ).toBe(3);
    } finally {
      await view.cleanup();
    }
  });

  it('snaps book starts to the top when approached closely', async () => {
    const view = await renderReader('');
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const bookStart = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="EXO/1"]',
      )!;
      expect(
        view.container
          .querySelector('[data-reader-chapter="GEN/1"]')
          ?.hasAttribute('data-reader-book-start'),
      ).toBe(true);
      expect(
        view.container
          .querySelector('[data-reader-chapter="GEN/2"]')
          ?.hasAttribute('data-reader-book-start'),
      ).toBe(false);
      expect(
        view.container
          .querySelector('[data-reader-chapter="EXO/1"]')
          ?.hasAttribute('data-reader-book-start'),
      ).toBe(true);
      expect(getComputedStyle(viewport).scrollSnapType).toBe('y');
      expect(getComputedStyle(bookStart).scrollSnapAlign).toBe('start');

      viewport.style.scrollPaddingBlockStart = '0px';
      const viewportTop = viewport.getBoundingClientRect().top;
      viewport.scrollTop +=
        bookStart.getBoundingClientRect().top - viewportTop - 20;
      await expect
        .poll(() => {
          const currentViewportTop = viewport.getBoundingClientRect().top;
          return Math.abs(
            bookStart.getBoundingClientRect().top - currentViewportTop,
          );
        })
        .toBeLessThan(2);
    } finally {
      await view.cleanup();
    }
  });

  it.each([
    {
      verseId: 'GEN/2:1',
      chapterId: 'GEN/2',
      nextChapter: 'EXO/1',
      withTab: false,
    },
    {
      verseId: 'EXO/1:1',
      chapterId: 'EXO/1',
      nextChapter: 'EXO/2',
      withTab: false,
    },
    {
      verseId: 'GEN/2:1',
      chapterId: 'GEN/2',
      nextChapter: 'EXO/1',
      withTab: true,
    },
    {
      verseId: 'EXO/1:1',
      chapterId: 'EXO/1',
      nextChapter: 'EXO/2',
      withTab: true,
    },
    {
      verseId: 'EXO/1:1',
      chapterId: 'EXO/1',
      nextChapter: 'EXO/2',
      withTab: true,
      browserHistory: true,
    },
  ])(
    'selects $verseId without moving the reader (tab: $withTab, browser history: $browserHistory)',
    async ({ verseId, chapterId, nextChapter, withTab, browserHistory }) => {
      const savedTabs = localStorage.getItem('margins:reading-tabs');
      const tab = withTab
        ? createReadingTab('eng_test', { bookId: 'GEN', chapter: 1 })
        : undefined;
      const view = await renderReader(
        '',
        tab?.id,
        undefined,
        undefined,
        browserHistory,
      );
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
            100;
          await expect
            .poll(() =>
              view.container.querySelector(
                `[data-reader-chapter="${id === 'GEN/2' ? 'EXO/1' : nextChapter}"]`,
              ),
            )
            .not.toBeNull();
        }
        await expect
          .poll(() => view.router.history.location.pathname)
          .toBe(`/eng_test/${chapterId}`);
        const historyLength = view.router.history.length;
        const verse = view.container.querySelector<HTMLElement>(
          `[data-verse-id="${verseId}"]`,
        )!;
        const before = verse.getBoundingClientRect().top;
        scrollIntoView.mockClear();
        await userEvent.click(verse);
        await expect
          .poll(() => view.router.state.location.search.verses)
          .toBe(verseId);
        await expect
          .poll(() => view.router.history.location.pathname)
          .toBe(`/eng_test/${chapterId}`);
        expect(view.router.state.location.maskedLocation?.search.verses).toBe(
          verseId,
        );
        await expect
          .poll(() => verse.getAttribute('data-selected'))
          .toBe('true');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        expect(view.router.state.location.pathname).toBe('/eng_test/GEN/1');
        expect(view.router.state.location.state.activeReadingTabId).toBe(
          tab?.id,
        );
        expect(view.router.state.location.maskedLocation?.pathname).toBe(
          `/eng_test/${chapterId}`,
        );
        expect(
          view.container.querySelector(`[data-verse-id="${verseId}"]`),
        ).toBe(verse);
        expect(
          Math.abs(verse.getBoundingClientRect().top - before),
        ).toBeLessThan(3);
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(view.router.history.length).toBe(historyLength);

        await userEvent.click(verse);
        await expect
          .poll(() => view.router.state.location.search.verses)
          .toBe('');
        expect(view.router.state.location.state.activeReadingTabId).toBe(
          tab?.id,
        );
        expect(view.router.history.location.pathname).toBe(
          `/eng_test/${chapterId}`,
        );
        expect(
          Math.abs(verse.getBoundingClientRect().top - before),
        ).toBeLessThan(3);
      } finally {
        scrollIntoView.mockRestore();
        await view.cleanup();
        if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
        else localStorage.setItem('margins:reading-tabs', savedTabs);
      }
    },
  );

  it('keeps the active tab and viewport when selecting in the original chapter', async () => {
    const savedTabs = localStorage.getItem('margins:reading-tabs');
    const tab = createReadingTab('eng_test', { bookId: 'GEN', chapter: 1 });
    const view = await renderReader('', tab.id, undefined, undefined, true);
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/1"]',
      )!;
      chapter.style.paddingTop = '250px';
      const verse = chapter.querySelector<HTMLElement>(
        '[data-verse-id="GEN/1:1"]',
      )!;
      viewport.scrollTop = 150;
      const before = verse.getBoundingClientRect().top;
      const historyLength = view.router.history.length;
      await userEvent.click(verse);
      await expect.poll(() => verse.getAttribute('data-selected')).toBe('true');
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      expect(view.router.state.location.state.activeReadingTabId).toBe(tab.id);
      expect(view.container.querySelector('[data-verse-id="GEN/1:1"]')).toBe(
        verse,
      );
      expect(Math.abs(verse.getBoundingClientRect().top - before)).toBeLessThan(
        3,
      );
      expect(view.router.history.length).toBe(historyLength);
    } finally {
      await view.cleanup();
      if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', savedTabs);
    }
  });

  it('restores selections and scroll position when switching between reader tabs', async () => {
    const storageKeys = [
      'margins:reading-tabs',
      'margins:translation',
      'margins:recent-translations',
      'margins:visited-before',
      'margins:nav-expanded',
    ];
    const savedStorage = storageKeys.map((key) => localStorage.getItem(key));
    storageKeys.forEach((key) => localStorage.removeItem(key));
    const firstSelection = 'GEN/1:1-GEN/1:2';
    const firstTab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: firstSelection,
    });
    const secondTab = createReadingTab('eng_test', {
      bookId: 'EXO',
      chapter: 1,
      verses: 'EXO/1:1',
    });
    const readerSources = [
      {
        bookId: 'GEN',
        source:
          '\\id GEN\n\\c 1\n\\p\n\\v 1 Beginning\n\\v 2 Second verse\n\\v 3 Third verse\n\\c 2\n\\p\n\\v 1 End',
      },
      sources[1],
    ];
    const view = await renderReader(
      firstSelection,
      firstTab.id,
      undefined,
      undefined,
      false,
      '',
      manifest,
      true,
      readerSources,
    );
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const firstChapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/1"]',
      )!;
      viewport.scrollTop +=
        firstChapter.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        200;
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      const expectedScrollProgress =
        (viewport.getBoundingClientRect().top -
          firstChapter.getBoundingClientRect().top) /
        firstChapter.getBoundingClientRect().height;
      await expect
        .poll(
          () =>
            viewport.getBoundingClientRect().top -
            firstChapter.getBoundingClientRect().top,
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readReadingTabsState().tabs.find((tab) => tab.id === firstTab.id)
              ?.scrollProgress,
        )
        .toBeCloseTo(expectedScrollProgress, 3);
      const firstScrollProgress = readReadingTabsState().tabs.find(
        (tab) => tab.id === firstTab.id,
      )!.scrollProgress!;

      await expect.poll(() => readReadingTabsState().tabs).toHaveLength(2);
      const secondTabLink = view.container.querySelector<HTMLAnchorElement>(
        `[data-tab-id="${secondTab.id}"] a`,
      )!;
      expect(new URL(secondTabLink.href).hash).toBe('');
      let outgoingViewportScrolled = false;
      const onOutgoingViewportScroll = () => {
        outgoingViewportScrolled = true;
      };
      viewport.addEventListener('scroll', onOutgoingViewportScroll);
      await userEvent.click(secondTabLink);
      await expect
        .poll(() => view.router.state.location.state.activeReadingTabId)
        .toBe(secondTab.id);
      viewport.removeEventListener('scroll', onOutgoingViewportScroll);
      expect(outgoingViewportScrolled).toBe(false);
      await expect
        .poll(() => view.router.state.location.search.verses)
        .toBe('EXO/1:1');
      const secondVerse = view.container.querySelector<HTMLElement>(
        '[data-verse-id="EXO/1:1"]',
      )!;
      await expect
        .poll(() => secondVerse.getAttribute('data-selected'))
        .toBe('true');
      const secondViewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const visibleVerse = secondVerse.getBoundingClientRect();
      const visibleViewport = secondViewport.getBoundingClientRect();
      expect(visibleVerse.bottom).toBeGreaterThan(visibleViewport.top);
      expect(visibleVerse.top).toBeLessThan(visibleViewport.bottom);

      await userEvent.click(
        view.container.querySelector<HTMLAnchorElement>(
          `[data-tab-id="${firstTab.id}"] a`,
        )!,
      );
      await expect
        .poll(() => view.router.state.location.state.activeReadingTabId)
        .toBe(firstTab.id);
      await expect
        .poll(() =>
          view.container
            .querySelector('[data-verse-id="GEN/1:1"]')
            ?.getAttribute('data-selected'),
        )
        .toBe('true');
      await expect
        .poll(() =>
          view.container
            .querySelector('[data-verse-id="GEN/1:2"]')
            ?.getAttribute('data-selected'),
        )
        .toBe('true');
      await expect
        .poll(() =>
          Math.abs(
            view.container
              .querySelector<HTMLElement>('[data-scroll-direction="vertical"]')!
              .getBoundingClientRect().top -
              view.container
                .querySelector<HTMLElement>('[data-reader-chapter="GEN/1"]')!
                .getBoundingClientRect().top -
              firstScrollProgress *
                view.container
                  .querySelector<HTMLElement>('[data-reader-chapter="GEN/1"]')!
                  .getBoundingClientRect().height,
          ),
        )
        .toBeLessThan(3);
    } finally {
      await view.cleanup();
      storageKeys.forEach((key, index) => {
        const value = savedStorage[index];
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
    }
  });

  it('links to a scrolled chapter while restoring the original tab and its progress', async () => {
    const savedTabs = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const firstTab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: 'GEN/1:1',
    });
    storeReadingTabScrollPosition(
      firstTab.id,
      firstTab,
      firstTab.translationId,
      { bookId: 'GEN', chapter: 2 },
      0.25,
    );
    const secondTab = createReadingTab('eng_test', {
      bookId: 'EXO',
      chapter: 1,
    });
    const view = await renderReader(
      '',
      secondTab.id,
      undefined,
      '/eng_test/EXO/1',
      false,
      '',
      manifest,
      true,
    );
    const visitedPaths: string[] = [];
    const unsubscribe = view.router.history.subscribe(({ location }) => {
      visitedPaths.push(location.pathname);
    });
    try {
      const link = view.container.querySelector<HTMLAnchorElement>(
        `[data-tab-id="${firstTab.id}"] a`,
      )!;
      const sharedUrl = new URL(link.href);
      expect(sharedUrl.pathname).toBe('/eng_test/GEN/2');
      expect(sharedUrl.searchParams.get('verses')).toBe('GEN/1:1');
      expect(sharedUrl.searchParams.has('scrollProgress')).toBe(false);

      await userEvent.click(link);
      await expect
        .poll(() => view.router.state.location.state.activeReadingTabId)
        .toBe(firstTab.id);
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      expect(view.router.state.location.pathname).toBe('/eng_test/GEN/1');
      expect(visitedPaths).not.toContain('/eng_test/GEN/1');
      await expect
        .poll(() => {
          const viewport = view.container.querySelector<HTMLElement>(
            '[data-scroll-direction="vertical"]',
          );
          const chapter = view.container.querySelector<HTMLElement>(
            '[data-reader-chapter="GEN/2"]',
          );
          if (!viewport || !chapter) return undefined;
          return (
            (viewport.getBoundingClientRect().top -
              chapter.getBoundingClientRect().top) /
            chapter.getBoundingClientRect().height
          );
        })
        .toBeCloseTo(0.25, 2);

      const reopened = await renderReader(
        sharedUrl.searchParams.get('verses')!,
        undefined,
        undefined,
        sharedUrl.pathname,
      );
      try {
        expect(reopened.router.state.location.pathname).toBe('/eng_test/GEN/2');
        expect(reopened.router.state.location.search.verses).toBe('GEN/1:1');
        const viewport = reopened.container.querySelector<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        )!;
        const chapter = reopened.container.querySelector<HTMLElement>(
          '[data-reader-chapter="GEN/2"]',
        )!;
        expect(
          viewport.getBoundingClientRect().top -
            chapter.getBoundingClientRect().top,
        ).toBeCloseTo(0, 0);
      } finally {
        await reopened.cleanup();
      }
    } finally {
      unsubscribe();
      await view.cleanup();
      if (savedTabs === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', savedTabs);
    }
  });

  it('waits for the destination route before restoring a different tab', async () => {
    const storageKeys = [
      'margins:reading-tabs',
      'margins:translation',
      'margins:recent-translations',
      'margins:visited-before',
      'margins:nav-expanded',
    ];
    const savedStorage = storageKeys.map((key) => localStorage.getItem(key));
    storageKeys.forEach((key) => localStorage.removeItem(key));
    const firstTab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: 'GEN/1:1',
    });
    const secondTab = createReadingTab('eng_test', {
      bookId: 'EXO',
      chapter: 1,
      verses: 'EXO/1:1',
    });
    storeReadingTabScrollPosition(
      secondTab.id,
      secondTab,
      'eng_test',
      secondTab,
      0.2,
    );
    const view = await renderReader(
      'GEN/1:1',
      firstTab.id,
      undefined,
      undefined,
      false,
      '',
      manifest,
      true,
    );
    const loadGate = Promise.withResolvers<void>();
    const startViewTransition = vi
      .spyOn(view.router, 'startViewTransition')
      .mockImplementation((update) => update());
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.scrollTop = 30;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const outgoingScrollTop = viewport.scrollTop;
      expect(outgoingScrollTop).toBeGreaterThan(0);
      const firstChapter = view.container.querySelector(
        '[data-reader-chapter="GEN/1"]',
      );
      const loadCount = view.load.mock.calls.length;
      view.deferNextLoad(loadGate.promise);

      view.container
        .querySelector<HTMLAnchorElement>(`[data-tab-id="${secondTab.id}"] a`)!
        .click();
      await expect
        .poll(() => view.load.mock.calls.length)
        .toBeGreaterThan(loadCount);

      expect(
        view.container.querySelector('[data-reader-chapter="GEN/1"]'),
      ).toBe(firstChapter);
      expect(
        view.container.querySelector('[data-scroll-direction="vertical"]'),
      ).toBe(viewport);
      expect(outgoingScrollTop).toBeGreaterThan(0);
      expect(
        view.container
          .querySelector('[data-verse-id="GEN/1:1"]')
          ?.getAttribute('data-selected'),
      ).toBe('true');
      loadGate.resolve();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/EXO/1');
      await expect
        .poll(() =>
          view.container
            .querySelector('[data-verse-id="EXO/1:1"]')
            ?.getAttribute('data-selected'),
        )
        .toBe('true');
      expect(
        view.container.querySelector('[data-scroll-direction="vertical"]'),
      ).not.toBe(viewport);
      await expect
        .poll(() => {
          const nextViewport = view.container.querySelector<HTMLElement>(
            '[data-scroll-direction="vertical"]',
          )!;
          const chapter = view.container.querySelector<HTMLElement>(
            '[data-reader-chapter="EXO/1"]',
          )!;
          return (
            (nextViewport.getBoundingClientRect().top -
              chapter.getBoundingClientRect().top) /
            chapter.getBoundingClientRect().height
          );
        })
        .toBeCloseTo(0.2, 2);
    } finally {
      loadGate.resolve();
      startViewTransition.mockRestore();
      await view.cleanup();
      storageKeys.forEach((key, index) => {
        const value = savedStorage[index];
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
    }
  });

  it('scrolls to an initially selected verse but not subsequent selections', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const view = await renderReader('GEN/1:1');
    try {
      const verse = view.container.querySelector<HTMLElement>(
        '[data-verse-id="GEN/1:1"]',
      )!;
      await expect.poll(() => scrollIntoView.mock.contexts).toContain(verse);
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'start' }),
      );
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

  it('respects reduced motion when scrolling to the initial selection', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const matchMedia = window.matchMedia.bind(window);
    const mediaQuery = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query) => {
        const result = matchMedia(query);
        if (query === '(prefers-reduced-motion: reduce)') {
          Object.defineProperty(result, 'matches', { value: true });
        }
        return result;
      });
    const view = await renderReader('GEN/1:1');
    try {
      await expect
        .poll(() => scrollIntoView.mock.calls)
        .toContainEqual([expect.objectContaining({ behavior: 'auto' })]);
    } finally {
      mediaQuery.mockRestore();
      scrollIntoView.mockRestore();
      await view.cleanup();
    }
  });

  it('positions an initially selected verse near the top below the sticky header', async () => {
    const view = await renderReader(
      'GEN/1:1',
      undefined,
      undefined,
      undefined,
      false,
      '[id="verse-GEN/1:1"] { display: block; margin-top: 350px; }',
    );
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const verse = view.container.querySelector<HTMLElement>(
        '[id="verse-GEN/1:1"]',
      )!;
      const header = view.container.querySelector<HTMLElement>(
        '[data-reader-controls]',
      )!;
      await expect
        .poll(() => {
          const viewportRect = viewport.getBoundingClientRect();
          const verseTop = verse.getBoundingClientRect().top;
          return (
            verseTop >= header.getBoundingClientRect().bottom &&
            verseTop - viewportRect.top < viewportRect.height * 0.4
          );
        })
        .toBe(true);
    } finally {
      await view.cleanup();
    }
  });

  it('keeps the original selection unambiguous in a shareable scrolled URL', async () => {
    const view = await renderReader('GEN/1:1');
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      for (const [chapter, next] of [
        ['GEN/2', 'EXO/1'],
        ['EXO/1', 'EXO/2'],
      ]) {
        const element = view.container.querySelector<HTMLElement>(
          `[data-reader-chapter="${chapter}"]`,
        )!;
        viewport.scrollTop +=
          element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          100;
        await expect
          .poll(() =>
            view.container.querySelector(`[data-reader-chapter="${next}"]`),
          )
          .not.toBeNull();
        await expect
          .poll(() => view.router.history.location.pathname)
          .toBe(`/eng_test/${chapter}`);
      }
      const shareUrl = view.router.history.location.href;
      const copied = new URL(shareUrl, window.location.origin);
      expect(copied.searchParams.get('verses')).toBe('GEN/1:1');
      expect(view.router.state.location.search.verses).toBe('GEN/1:1');

      const reopened = await renderReader(
        copied.searchParams.get('verses')!,
        undefined,
        ['GEN', 'EXO'],
        copied.pathname,
      );
      try {
        expect(
          reopened.container.querySelector<HTMLInputElement>(
            '[aria-label="Book"]',
          )?.value,
        ).toBe('Exodus');
        expect(
          reopened.container.querySelector<HTMLInputElement>(
            '[aria-label="Chapter"]',
          )?.value,
        ).toBe('1');
        expect(reopened.router.state.location.search.verses).toBe('GEN/1:1');
      } finally {
        await reopened.cleanup();
      }
    } finally {
      await view.cleanup();
    }
  });

  it('scrolls to an annotation verse outside the current chapter window', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const view = await renderReader(
      'GEN/1:1',
      undefined,
      undefined,
      undefined,
      false,
      '',
      {
        ...manifest,
        books: [
          { id: 'GEN', title: 'Genesis', chapters: 8 },
          { id: 'EXO', title: 'Exodus', chapters: 2 },
        ],
      },
      false,
      [
        {
          bookId: 'GEN',
          source: `${sources[0].source}\n\\c 7\n\\p\n\\v 1 Far`,
        },
        sources[1],
      ],
    );
    const annotations = getAnnotationCollections(view.dbClient).annotations;
    const id = crypto.randomUUID();
    try {
      await ensureAnnotationCollectionReady(annotations);
      await annotations.insert({
        id,
        rkey: id,
        uri: null,
        cid: null,
        authorDid: null,
        bookId: 'GEN',
        chapter: 7,
        chapterKeys: ['GEN/1', 'GEN/7'],
        verses: ['GEN/7:1', 'GEN/1:1'],
        comment: 'Annotation',
        createdAt: new Date().toISOString(),
        status: 'pending',
        syncError: null,
      }).isPersisted.promise;
      scrollIntoView.mockClear();
      await view.router.navigate({
        to: '/$translation/$book/$chapter',
        params: { translation: 'eng_test', book: 'GEN', chapter: '1' },
        search: { verses: 'GEN/1:1', annotation: id },
        state: true,
        replace: true,
        resetScroll: false,
      });
      await expect
        .poll(() =>
          scrollIntoView.mock.contexts.some(
            (element) =>
              element instanceof Element && element.id === 'verse-GEN/7:1',
          ),
        )
        .toBe(true);
    } finally {
      scrollIntoView.mockRestore();
      await view.cleanup();
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('margins-annotations', 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('annotations', 'readwrite');
        transaction.objectStore('annotations').delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    }
  });

  it('restores a masked chapter when history returns to an older tab route', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const saved = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const tab = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
      verses: 'GEN/1:1',
    });
    const view = await renderReader('GEN/1:1', tab.id);
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/2"]',
      )!;
      viewport.scrollTop +=
        chapter.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        100;
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      const bookInput = page.getByRole('textbox', { name: 'Book' });
      await bookInput.click();
      await userEvent.keyboard('EXO');
      await page.getByRole('option', { name: /Exodus/ }).click();
      await page.getByRole('option', { name: '1', exact: true }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_test/EXO/1');
      expect(view.router.state.location.search.verses).toBe('');
      view.router.history.back();
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      await expect(page.getByRole('textbox', { name: 'Book' })).toHaveValue(
        'Genesis',
      );
      expect(view.router.state.location.search.verses).toBe('GEN/1:1');
    } finally {
      scrollIntoView.mockRestore();
      await view.cleanup();
      if (saved === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', saved);
    }
  });

  it('navigates with chapter buttons and clears the selection', async () => {
    const view = await renderReader('GEN/1:1');
    try {
      const length = view.router.history.length;
      await page.getByRole('button', { name: 'Next chapter' }).click();
      await expect
        .poll(() => view.router.history.location.pathname)
        .toBe('/eng_test/GEN/2');
      expect(view.router.state.location.search.verses).toBe('');
      expect(view.router.history.length).toBe(length + 1);
      view.router.history.back();
      await expect
        .poll(() => view.router.state.location.search.verses)
        .toBe('GEN/1:1');
    } finally {
      await view.cleanup();
    }
  });

  it('opens a fresh URL in a new tab without inheriting saved progress', async () => {
    const saved = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const existing = createReadingTab('eng_test', {
      bookId: 'GEN',
      chapter: 1,
    });
    storeReadingTabScrollPosition(
      existing.id,
      existing,
      existing.translationId,
      existing,
      0.5,
    );
    const view = await renderReader(
      '',
      undefined,
      undefined,
      undefined,
      false,
      '',
      manifest,
      true,
    );
    try {
      await expect
        .poll(() => view.router.state.location.state.activeReadingTabId)
        .toBeTruthy();
      expect(view.router.state.location.state.activeReadingTabId).not.toBe(
        existing.id,
      );
      expect(readReadingTabsState().tabs).toHaveLength(2);
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/1"]',
      )!;
      expect(
        viewport.getBoundingClientRect().top -
          chapter.getBoundingClientRect().top,
      ).toBeCloseTo(0, 0);
    } finally {
      await view.cleanup();
      if (saved === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', saved);
    }
  });

  it('flushes pending reading progress when leaving a tab', async () => {
    const saved = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const tab = createReadingTab('eng_test', { bookId: 'GEN', chapter: 1 });
    const view = await renderReader('', tab.id);
    let cleaned = false;
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/1"]',
      )!;
      viewport.scrollTop += 100;
      viewport.dispatchEvent(new Event('scroll'));
      const expected =
        (viewport.getBoundingClientRect().top -
          chapter.getBoundingClientRect().top) /
        chapter.getBoundingClientRect().height;
      await view.cleanup();
      cleaned = true;
      expect(readReadingTabsState().tabs[0].scrollProgress).toBeCloseTo(
        expected,
        3,
      );
    } finally {
      if (!cleaned) await view.cleanup();
      if (saved === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', saved);
    }
  });

  it('flushes pending reading progress when the page is hidden', async () => {
    const saved = localStorage.getItem('margins:reading-tabs');
    localStorage.removeItem('margins:reading-tabs');
    const tab = createReadingTab('eng_test', { bookId: 'GEN', chapter: 1 });
    const view = await renderReader('', tab.id);
    try {
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/1"]',
      )!;
      viewport.scrollTop += 100;
      viewport.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('pagehide'));
      const expected =
        (viewport.getBoundingClientRect().top -
          chapter.getBoundingClientRect().top) /
        chapter.getBoundingClientRect().height;
      expect(readReadingTabsState().tabs[0].scrollProgress).toBeCloseTo(
        expected,
        3,
      );
    } finally {
      await view.cleanup();
      if (saved === null) localStorage.removeItem('margins:reading-tabs');
      else localStorage.setItem('margins:reading-tabs', saved);
    }
  });

  it('replaces the actual browser URL without adding history entries', async () => {
    const view = await renderReader(
      'GEN/1:1',
      undefined,
      ['GEN', 'EXO'],
      undefined,
      true,
    );
    try {
      const length = window.history.length;
      const viewport = view.container.querySelector<HTMLElement>(
        '[data-scroll-direction="vertical"]',
      )!;
      viewport.style.height = '300px';
      const chapter = view.container.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/2"]',
      )!;
      viewport.scrollTop +=
        chapter.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        100;
      await expect.poll(() => window.location.pathname).toBe('/eng_test/GEN/2');
      expect(new URLSearchParams(window.location.search).get('verses')).toBe(
        'GEN/1:1',
      );
      expect(window.history.length).toBe(length);
      const restored = view.router.parseLocation(view.router.history.location);
      expect(restored.pathname).toBe('/eng_test/GEN/1');
      expect(restored.maskedLocation?.pathname).toBe('/eng_test/GEN/2');
    } finally {
      await view.cleanup();
    }
  });
});
