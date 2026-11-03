import { DbClient, DbProvider } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserHistory,
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
import { cdp, page, userEvent } from 'vitest/browser';

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
  initialPath = '/eng_test/GEN/1',
  browserHistory = false,
  fixtureStyles = '',
  readerManifest = manifest,
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
      manifest: readerManifest,
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
  if (activeReadingTabId) history.replace(initialUrl, { activeReadingTabId });
  const router = createRouter({
    routeTree: rootRoute.addChildren([readerRoute]),
    history,
    scrollRestoration: true,
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
    router,
    load,
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
        ).toEqual(['GEN/1', 'GEN/2', 'EXO/1']);
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
      await moveTo('GEN/2', ['GEN/1', 'GEN/2', 'EXO/1', 'EXO/2']);
      await moveTo('EXO/1', ['GEN/1', 'GEN/2', 'EXO/1', 'EXO/2']);
      await moveTo('EXO/2', ['GEN/2', 'EXO/1', 'EXO/2']);
      expect(
        view.container.querySelector<HTMLButtonElement>(
          'button[aria-label="Next chapter"]',
        )!.disabled,
      ).toBe(true);
      await moveTo('EXO/1', ['GEN/1', 'GEN/2', 'EXO/1', 'EXO/2']);
      await moveTo('GEN/2', ['GEN/1', 'GEN/2', 'EXO/1', 'EXO/2']);
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
        .toEqual(['GEN/1', 'GEN/2', 'EXO/1', 'EXO/2']);
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
      await page.getByRole('button', { name: 'Genesis, Chapter 1' }).click();
      await page.getByRole('button', { name: 'Exodus', exact: true }).click();
      await page.getByRole('button', { name: '2', exact: true }).click();
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
      expect(view.router.history.location.pathname).toBe('/eng_test/GEN/2');
      view.router.history.forward();
      await expect
        .poll(() =>
          view.container.querySelector('[aria-label="Genesis, Chapter 1"]'),
        )
        .not.toBeNull();
      expect(view.router.history.location.pathname).toBe('/eng_test/GEN/1');
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
      ).toEqual(['GEN/1', 'GEN/2', 'EXO/1', 'EXO/2']);
      expect(view.router.state.location.search.verses).toBe(selection);
    } finally {
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

  it('starts with the active chapter and two adjacent chapters', async () => {
    const view = await renderReader('EXO/1:1,GEN/1:1-GEN/2:1');
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
      ).toEqual([]);
      expect(
        view.container.querySelectorAll('[data-selected="true"]').length,
      ).toBe(3);
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
          .poll(() => view.router.history.location.pathname)
          .toBe('/eng_test/GEN/2');
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
        expect(view.router.state.location.state.readingPosition).toEqual({
          bookId: chapterId.split('/')[0],
          chapter: Number(chapterId.split('/')[1]),
        });
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
        '[aria-label="Genesis, Chapter 1"]',
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
          reopened.container.querySelector('[aria-label="Exodus, Chapter 1"]'),
        ).not.toBeNull();
        expect(reopened.router.state.location.search.verses).toBe('GEN/1:1');
      } finally {
        await reopened.cleanup();
      }
    } finally {
      await view.cleanup();
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
      expect(restored.state.readingPosition).toEqual({
        bookId: 'GEN',
        chapter: 2,
      });
    } finally {
      await view.cleanup();
    }
  });
});
