import {
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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import {
  readReadingTabsState,
  storeReadingTabPosition,
} from '../../lib/bible/reading-tabs';
import { normalizeVerseSelection } from '../../lib/bible/selection';
import {
  useSelectedVerseIds,
  VerseSelectionProvider,
} from '../annotations/VerseSelection';
import { AppNavigation } from './AppNavigation';
import { useAddReadingTab } from './readingTabs';

vi.mock('../bible/useTranslationManifest', () => ({
  useTranslationManifest: () => ({ data: undefined }),
}));

const storageKeys = [
  'margins:reading-tabs',
  'margins:visited-before',
  'margins:nav-expanded',
];
let savedStorage: (string | null)[] = [];

beforeEach(() => {
  savedStorage = storageKeys.map((key) => localStorage.getItem(key));
  storageKeys.forEach((key) => localStorage.removeItem(key));
});

afterEach(() => {
  vi.restoreAllMocks();
  storageKeys.forEach((key, index) => {
    const value = savedStorage[index];
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
});

function AddTab() {
  const addTab = useAddReadingTab();
  return createElement(
    'button',
    {
      onClick: () =>
        addTab({
          translation: 'eng_webu',
          book: 'JHN',
          chapter: 3,
          verses: 'JHN/3:2-JHN/3:3,JHN/4:1',
        }),
    },
    'Open reading',
  );
}

function Selection() {
  return createElement('output', null, useSelectedVerseIds().join(','));
}

it('restores the supplied verses when revisiting a tab through app navigation', async () => {
  const rootRoute = createRootRoute({
    component: () =>
      createElement(
        'div',
        null,
        createElement(AppNavigation),
        createElement(Outlet),
      ),
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: AddTab,
  });
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({
      verses: normalizeVerseSelection(search.verses),
    }),
    loader: () => ({
      location: { bookId: 'JHN', chapter: 3 },
      sources: [
        {
          bookId: 'JHN',
          source:
            '\\id JHN\n\\c 3\n\\p\n\\v 1 One\n\\v 2 Two\n\\v 3 Three\n\\c 4\n\\p\n\\v 1 Four',
        },
      ],
    }),
    component: () =>
      createElement(VerseSelectionProvider, null, createElement(Selection)),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, readerRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  vi.spyOn(router, 'startViewTransition').mockImplementation((update) =>
    update(),
  );
  await router.load();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => root.render(createElement(RouterProvider, { router })));
  try {
    await page.getByRole('button', { name: 'Open reading' }).click();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('JHN/3:2,JHN/3:3,JHN/4:1');
    const tab = readReadingTabsState().tabs[0];
    expect(tab.verses).toBe('JHN/3:2-JHN/3:3,JHN/4:1');

    container.querySelector<HTMLAnchorElement>('a[href="/"]')!.click();
    await expect
      .element(page.getByRole('button', { name: 'Open reading' }))
      .toBeVisible();
    const link = container.querySelector<HTMLAnchorElement>(
      `[data-tab-id="${tab.id}"] a`,
    )!;
    const url = new URL(link.href);
    expect(url.pathname).toBe('/eng_webu/JHN/3');
    expect(url.searchParams.get('verses')).toBe('JHN/3:2-JHN/3:3,JHN/4:1');
    expect(url.hash).toBe('#verse-JHN/3:2');
    link.click();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('JHN/3:2,JHN/3:3,JHN/4:1');
    expect(router.state.location.state.activeReadingTabId).toBe(tab.id);
    expect(readReadingTabsState().tabs[0].verses).toBe(
      'JHN/3:2-JHN/3:3,JHN/4:1',
    );

    storeReadingTabPosition(tab.id, tab, tab.translationId, {
      bookId: 'JHN',
      chapter: 4,
    });
    await expect.element(page.getByText('JHN 4')).toBeVisible();
    container.querySelector<HTMLAnchorElement>('a[href="/"]')!.click();
    await expect
      .element(page.getByRole('button', { name: 'Open reading' }))
      .toBeVisible();
    container
      .querySelector<HTMLAnchorElement>(`[data-tab-id="${tab.id}"] a`)!
      .click();
    await expect
      .poll(() => router.state.location.state.readingPosition)
      .toEqual({ bookId: 'JHN', chapter: 4 });
  } finally {
    root.unmount();
    container.remove();
  }
});
