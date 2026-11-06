import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import messages from '../../../messages/en.json';
import type * as FetchBible from '../../lib/bible/fetch-bible';
import { builtinTranslations } from '../../lib/bible/manifests';
import {
  createReadingTab,
  getReadingTabDestination,
  readReadingTabsState,
  storeReadingTabScrollPosition,
} from '../../lib/bible/reading-tabs';
import type * as BibleSource from '../../lib/bible/source';
import { BibleRecovery } from './BibleRecovery';

const { fetchManifest, fetchCatalog } = vi.hoisted(() => ({
  fetchManifest: vi.fn(),
  fetchCatalog: vi.fn(),
}));

vi.mock('#/paraglide/messages', async () => {
  const { default: en } = await import('../../../messages/en.json');
  return {
    m: Object.fromEntries(
      Object.entries(en).map(([key, value]) => [key, () => value]),
    ),
  };
});
vi.mock('../../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationManifest: fetchManifest,
}));
vi.mock('../../lib/bible/fetch-bible', async (importOriginal) => ({
  ...(await importOriginal<typeof FetchBible>()),
  fetchBibleCatalog: fetchCatalog,
}));
vi.mock('../auth/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('../settings/SettingsDialog', () => ({ SettingsDialog: () => null }));

const storageKeys = ['margins:reading-tabs', 'margins:nav-expanded'];
let savedStorage: (string | null)[] = [];

beforeEach(() => {
  savedStorage = storageKeys.map((key) => localStorage.getItem(key));
  storageKeys.forEach((key) => localStorage.removeItem(key));
  fetchCatalog.mockResolvedValue([
    { id: 'eng_wisdom', language: 'eng' },
    { id: 'eng_short', language: 'eng' },
    { id: 'eng_broken', language: 'eng' },
    { id: 'deu_wisdom', language: 'deu' },
  ]);
  fetchManifest.mockImplementation(async (id: string) => {
    if (id === 'eng_broken') throw new Error('Offline');
    return {
      id,
      title: id === 'eng_wisdom' ? 'English Wisdom' : id,
      metadata: builtinTranslations[0].metadata,
      books:
        id === 'eng_wisdom' || id === 'deu_wisdom'
          ? [{ id: 'WIS', title: 'Wisdom', chapters: 19 }]
          : id === 'eng_short'
            ? [{ id: 'WIS', title: 'Wisdom', chapters: 1 }]
            : [{ id: 'GEN', title: 'Genesis', chapters: 50 }],
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  storageKeys.forEach((key, index) => {
    const value = savedStorage[index];
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
});

async function renderRecovery(error = false, previousTab = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['translations'], []);
  if (previousTab) {
    const previous = createReadingTab('eng_webu', {
      bookId: 'GEN',
      chapter: 1,
    });
    storeReadingTabScrollPosition(
      previous.id,
      previous,
      previous.translationId,
      { bookId: 'GEN', chapter: 2 },
      0.5,
    );
  }
  const tab = createReadingTab('eng_webu', {
    bookId: 'WIS',
    chapter: 3,
    verses: 'WIS/3:1-WIS/3:3',
  });
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => createElement('h1', null, 'Home'),
  });
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({ verses: search.verses as string }),
    loader: ({ params }) => {
      if (params.translation === 'eng_webu' && params.book === 'WIS') {
        if (error) throw new Error('Unable to fetch book');
        throw notFound();
      }
    },
    notFoundComponent: BibleRecovery,
    errorComponent: BibleRecovery,
    component: () => createElement('h1', null, 'Reading'),
  });
  const history = createMemoryHistory({
    initialEntries: [
      '/eng_webu/WIS/3?verses=WIS%2F3%3A1-WIS%2F3%3A3#verse-WIS/3:1',
    ],
  });
  history.replace(history.location.href, getReadingTabDestination(tab).state);
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, readerRoute]),
    history,
  });
  vi.spyOn(router, 'startViewTransition').mockImplementation((update) =>
    update(),
  );
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
    tab,
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
      client.clear();
    },
  };
}

it.each([false, true])(
  'keeps navigation and a close action when WIS cannot load (error: %s)',
  async (error) => {
    const fixture = await renderRecovery(error);
    try {
      await expect
        .element(
          page.getByRole('navigation', { name: messages.app_navigation_label }),
        )
        .toBeVisible();
      await expect
        .element(
          page
            .getByRole('main')
            .getByRole('heading', { name: messages.bible_load_error }),
        )
        .toBeVisible();
      expect(fixture.container.querySelectorAll('main')).toHaveLength(1);
      await page
        .getByRole('main')
        .getByRole('button', { name: 'Close tab', exact: true })
        .click();
      await expect
        .element(page.getByRole('heading', { name: 'Home' }))
        .toBeVisible();
      expect(readReadingTabsState().tabs).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  },
);

it('closes the failed tab and returns to a remaining reading tab', async () => {
  const fixture = await renderRecovery(false, true);
  try {
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Close tab', exact: true })
      .click();
    await expect
      .element(page.getByRole('heading', { name: 'Reading' }))
      .toBeVisible();
    expect(fixture.router.state.location.pathname).toBe('/eng_webu/GEN/1');
    expect(fixture.router.history.location.pathname).toBe('/eng_webu/GEN/2');
    expect(readReadingTabsState().tabs.map((tab) => tab.bookId)).toEqual([
      'GEN',
    ]);
  } finally {
    fixture.cleanup();
  }
});

it('offers only same-language translations containing the WIS chapter and preserves the passage when switching', async () => {
  const fixture = await renderRecovery();
  try {
    await expect
      .element(
        page.getByRole('button', { name: 'English Wisdom', exact: true }),
      )
      .toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'eng_short', exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole('button', { name: 'deu_wisdom', exact: true }))
      .not.toBeInTheDocument();
    await page
      .getByRole('button', { name: 'English Wisdom', exact: true })
      .click();
    await expect
      .element(page.getByRole('heading', { name: 'Reading' }))
      .toBeVisible();
    expect(fixture.router.state.location.pathname).toBe('/eng_wisdom/WIS/3');
    expect(fixture.router.state.location.search.verses).toBe('WIS/3:1-WIS/3:3');
    expect(fixture.router.state.location.hash).toBe('verse-WIS/3:1');
    expect(fixture.router.state.location.state.activeReadingTabId).toBe(
      fixture.tab.id,
    );
    expect(fetchManifest).not.toHaveBeenCalledWith('deu_wisdom');
    expect(fetchManifest).toHaveBeenCalledWith('eng_short');
    expect(fetchManifest).toHaveBeenCalledWith('eng_broken');
  } finally {
    fixture.cleanup();
  }
});

it('still allows closing the tab when alternative translations cannot be checked', async () => {
  fetchCatalog.mockRejectedValue(new Error('Offline'));
  const fixture = await renderRecovery();
  try {
    await expect
      .element(page.getByText(messages.bible_load_error))
      .toBeVisible();
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Close tab', exact: true })
      .click();
    await expect
      .element(page.getByRole('heading', { name: 'Home' }))
      .toBeVisible();
  } finally {
    fixture.cleanup();
  }
});
