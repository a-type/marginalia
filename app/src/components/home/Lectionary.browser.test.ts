import { m } from '#/paraglide/messages';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  createReadingTab,
  readReadingTabsState,
} from '../../lib/bible/reading-tabs';
import { formatLectionaryDate } from '../../lib/lectionary';
import { Lectionary } from './Lectionary';

const storageKeys = [
  'margins:reading-tabs',
  'margins:visited-before',
  'margins:translation',
];
let savedStorage: (string | null)[] = [];
beforeEach(() => {
  savedStorage = storageKeys.map((key) => localStorage.getItem(key));
  storageKeys.forEach((key) => localStorage.removeItem(key));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  storageKeys.forEach((key, index) => {
    const value = savedStorage[index];
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
});

async function renderLectionary(unavailableIsaiah = false) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Lectionary,
  });
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, readerRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  vi.spyOn(router, 'startViewTransition').mockImplementation((update) =>
    update(),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    ['translation-book-verses', 'eng_webu', 'ISA'],
    unavailableIsaiah
      ? { available: false }
      : {
          available: true,
          title: 'Test',
          verses: [
            { id: 'ISA/10:1', label: '1', text: 'First' },
            { id: 'ISA/10:34', label: '34', text: 'Last' },
          ],
        },
  );
  await router.load();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(RouterProvider, { router }),
      ),
    ),
  );
  return {
    container,
    router,
    cleanup() {
      root.unmount();
      container.remove();
      queryClient.clear();
    },
  };
}

function mockLectServe(
  options: {
    dailyMatchesSunday?: boolean;
    empty?: boolean;
    fail?: boolean;
    weekday?: boolean;
  } = {},
) {
  const requests: string[] = [];
  let fail = options.fail;
  const fetch = vi.fn(async (input: string) => {
    requests.push(input);
    if (fail) return Response.json({ error: 'Unavailable' }, { status: 503 });
    const url = new URL(input, location.origin);
    const date = url.pathname.split('/').at(-1);
    const dailyLect = url.searchParams.get('dailyLect');
    return Response.json({
      daily: {
        date,
        lectionary: dailyLect,
        readings: {
          morning: {
            first: options.empty
              ? ''
              : options.dailyMatchesSunday
                ? 'Revelation 7:9-17'
                : options.weekday
                  ? 'Acts 6:1-7:16'
                  : 'Luke 1:1-4',
            second: options.weekday ? 'John 14:15-31' : '',
          },
          evening: {
            second: options.weekday ? 'Mark 9:1-29' : '',
            first:
              options.empty || options.dailyMatchesSunday ? '' : 'Isaiah 10',
          },
        },
      },
      sunday: {
        date: '2099-11-01',
        lectionary: url.searchParams.get('lect'),
        services: [{ name: 'All Saints', readings: ['Revelation 7:9-17'] }],
      },
      red_letter: {
        date,
        lectionary: url.searchParams.get('lect'),
        services: [
          {
            name: 'Sunday readings',
            readings:
              options.empty || options.weekday
                ? []
                : [
                    'Matthew 22:34-46 or Luke 6:20-26',
                    'Psalm 90:1-6, 13-17',
                    'Unknown book 1:1',
                  ],
          },
        ],
      },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    requests,
    recover() {
      fail = false;
    },
  };
}

describe('homepage lectionary', () => {
  it('hides daily readings when they match the upcoming Sunday readings', async () => {
    mockLectServe({ dailyMatchesSunday: true });
    const view = await renderLectionary();
    try {
      await expect
        .element(
          page.getByRole('link', {
            name: 'Revelation 7:9-17',
            exact: true,
          }),
        )
        .toBeVisible();
      const sections = view.container.querySelectorAll('section');
      expect(sections).toHaveLength(2);
      expect(
        [...sections].some((section) =>
          section.textContent?.includes('Daily Office'),
        ),
      ).toBe(false);
      expect(
        [...view.container.querySelectorAll('a')].filter(
          (anchor) => anchor.textContent?.trim() === 'Revelation 7:9-17',
        ),
      ).toHaveLength(1);
    } finally {
      view.cleanup();
    }
  });

  it('shows daily and upcoming Sunday links when the selected RCL day has no feast readings', async () => {
    mockLectServe({ weekday: true });
    const view = await renderLectionary();
    try {
      for (const citation of [
        'Acts 6:1-7:16',
        'John 14:15-31',
        'Isaiah 10',
        'Mark 9:1-29',
        'Revelation 7:9-17',
      ]) {
        await expect
          .element(page.getByRole('link', { name: citation, exact: true }))
          .toBeVisible();
      }
      const sections = view.container.querySelectorAll('section');
      expect(sections).toHaveLength(3);
      expect(sections[0].textContent).toContain('Daily Office');
      expect(sections[0].querySelector('time')?.dateTime).toBe(
        formatLectionaryDate(new Date()),
      );
      expect(sections[1].textContent).toContain('No readings are available');
      expect(sections[2].querySelector('time')?.dateTime).toBe('2099-11-01');
      expect(sections[2].textContent).toContain('All Saints');
    } finally {
      view.cleanup();
    }
  });

  it('loads the local date, changes tradition/date, and links to the first verse', async () => {
    const previousTab = createReadingTab('eng_webu', {
      bookId: 'GEN',
      chapter: 1,
    });
    const api = mockLectServe();
    const view = await renderLectionary();
    try {
      await expect
        .element(page.getByRole('link', { name: 'Matthew 22:34-46' }))
        .toBeVisible();
      const today = formatLectionaryDate(new Date());
      expect(api.requests).toContain(
        `/lectserve/date/${today}?lect=rcl&dailyLect=acna-sec`,
      );
      const link = [...view.container.querySelectorAll('a')].find(
        (item) => item.textContent === 'Matthew 22:34-46',
      );
      const url = new URL(link!.href);
      expect(url.pathname).toBe('/eng_webu/MAT/22');
      expect(url.hash).toBe('#verse-MAT/22:34');
      expect(url.searchParams.get('verses')).toBe('MAT/22:34-MAT/22:46');
      await expect.element(page.getByText('(alt)')).toBeVisible();
      await expect
        .element(
          page.getByText('This citation could not be linked to a Bible book.'),
        )
        .toBeVisible();

      await page
        .getByRole('combobox', { name: 'Lectionary tradition' })
        .click();
      await page
        .getByRole('option', {
          name: 'ACNA Daily Office (civil calendar)',
          exact: true,
        })
        .click();
      await expect
        .element(page.getByRole('link', { name: 'Luke 1:1-4' }))
        .toBeVisible();
      expect(api.requests).toContain(
        `/lectserve/date/${today}?lect=acna&dailyLect=acna-sec`,
      );
      await expect
        .element(page.getByRole('heading', { name: 'Morning Prayer' }))
        .toBeVisible();
      await expect
        .element(page.getByRole('heading', { name: 'Evening Prayer' }))
        .toBeVisible();

      await page.getByRole('button', { name: /^Reading date:/ }).click();
      const calendar = page.getByRole('dialog');
      await expect.element(calendar).toBeVisible();
      await page.getByRole('button', { name: 'Next month' }).click();
      const now = new Date();
      const otherDay = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      await page
        .getByRole('button', {
          name: otherDay.toLocaleDateString('en', { dateStyle: 'long' }),
          exact: true,
        })
        .click();
      await expect
        .poll(
          () =>
            api.requests.filter((request) =>
              request.includes('/lectserve/date/'),
            ).length,
        )
        .toBe(3);
      const changed = new URL(api.requests.at(-1)!, location.origin);
      expect(changed.pathname).toBe(
        `/lectserve/date/${formatLectionaryDate(otherDay)}`,
      );
      expect(changed.searchParams.get('dailyLect')).toBe('acna-sec');

      await expect
        .element(page.getByRole('link', { name: 'Luke 1:1-4' }))
        .toBeVisible();
      await page.getByRole('link', { name: 'Luke 1:1-4' }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_webu/LUK/1');
      expect(view.router.state.location.search).toEqual({
        verses: 'LUK/1:1-LUK/1:4',
      });
      expect(view.router.state.location.hash).toBe('verse-LUK/1:1');
      const tabs = readReadingTabsState().tabs;
      expect(tabs).toHaveLength(2);
      expect(tabs[0]).toEqual(previousTab);
      expect(tabs[1]).toMatchObject({
        bookId: 'LUK',
        chapter: 1,
        translationId: 'eng_webu',
      });
      expect(view.router.state.location.state.activeReadingTabId).toBe(
        tabs[1].id,
      );
    } finally {
      view.cleanup();
    }
  });

  it('opens only the selected group in new tabs, including alternatives but skipping unresolved citations', async () => {
    mockLectServe();
    const previousTab = createReadingTab('eng_msb', {
      bookId: 'GEN',
      chapter: 1,
    });
    const view = await renderLectionary();
    try {
      await expect
        .element(page.getByRole('link', { name: 'Matthew 22:34-46' }))
        .toBeVisible();
      const sections = view.container.querySelectorAll('section');
      const button = sections[1].querySelector('button');
      expect(button?.textContent).toBe(m.lectionary_open_all_tabs());
      button!.click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_msb/MAT/22');
      const tabs = readReadingTabsState().tabs;
      expect(tabs).toHaveLength(4);
      expect(tabs[0]).toEqual(previousTab);
      expect(
        tabs.slice(1).map(({ bookId, chapter, translationId }) => ({
          bookId,
          chapter,
          translationId,
        })),
      ).toEqual([
        { bookId: 'MAT', chapter: 22, translationId: 'eng_msb' },
        { bookId: 'LUK', chapter: 6, translationId: 'eng_msb' },
        { bookId: 'PSA', chapter: 90, translationId: 'eng_msb' },
      ]);
      expect(new Set(tabs.map(({ id }) => id)).size).toBe(4);
      expect(view.router.state.location.state.activeReadingTabId).toBe(
        tabs[1].id,
      );
      expect(view.router.state.location.search).toEqual({
        verses: 'MAT/22:34-MAT/22:46',
      });
      expect(tabs.slice(1).map((tab) => tab.verses)).toEqual([
        'MAT/22:34-MAT/22:46',
        'LUK/6:20-LUK/6:26',
        'PSA/90:1-PSA/90:6,PSA/90:13-PSA/90:17',
      ]);
    } finally {
      view.cleanup();
    }
  });

  it('offers bulk opening separately for morning, evening, and Sunday groups', async () => {
    mockLectServe({ weekday: true });
    const view = await renderLectionary();
    try {
      await expect
        .element(page.getByRole('link', { name: 'Acts 6:1-7:16' }))
        .toBeVisible();
      const buttons =
        view.container.querySelectorAll<HTMLButtonElement>('section button');
      expect([...buttons].map((button) => button.textContent)).toEqual([
        m.lectionary_open_all_tabs(),
        m.lectionary_open_all_tabs(),
        m.lectionary_open_all_tabs(),
      ]);
      buttons[0].click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_webu/ACT/6');
      expect(
        readReadingTabsState().tabs.map(({ bookId, chapter }) => ({
          bookId,
          chapter,
        })),
      ).toEqual([
        { bookId: 'ACT', chapter: 6 },
        { bookId: 'JHN', chapter: 14 },
      ]);
      expect(view.router.state.location.search).toEqual({
        verses: 'ACT/6:1-ACT/7:16',
      });
      expect(view.router.state.location.hash).toBe('verse-ACT/6:1');
    } finally {
      view.cleanup();
    }
  });

  it('opens chapter-only readings with the entire chapter selected', async () => {
    mockLectServe();
    const view = await renderLectionary();
    try {
      await expect
        .element(page.getByRole('link', { name: 'Isaiah 10' }))
        .toBeVisible();
      await page.getByRole('link', { name: 'Isaiah 10' }).click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_webu/ISA/10');
      expect(readReadingTabsState().tabs).toHaveLength(1);
      expect(view.router.state.location.search).toEqual({
        verses: 'ISA/10:1-ISA/10:34',
      });

      expect(view.router.state.location.hash).toBe('verse-ISA/10:1');
    } finally {
      view.cleanup();
    }
  });

  it('reports an unavailable chapter but can open other readings in its group', async () => {
    mockLectServe({ weekday: true });
    const view = await renderLectionary(true);
    try {
      await expect
        .element(page.getByRole('alert'))
        .toHaveTextContent('This passage is unavailable');
      const buttons =
        view.container.querySelectorAll<HTMLButtonElement>('section button');
      expect(buttons[1].disabled).toBe(false);
      buttons[1].click();
      await expect
        .poll(() => view.router.state.location.pathname)
        .toBe('/eng_webu/MRK/9');
      expect(readReadingTabsState().tabs).toMatchObject([
        { bookId: 'MRK', verses: 'MRK/9:1-MRK/9:29' },
      ]);
    } finally {
      view.cleanup();
    }
  });

  it('explains empty days while keeping the date and tradition controls usable', async () => {
    mockLectServe({ empty: true });
    const view = await renderLectionary();
    try {
      await expect
        .element(page.getByRole('status').first())
        .toHaveTextContent('No readings are available');
      await expect
        .element(page.getByRole('combobox', { name: 'Lectionary tradition' }))
        .toBeEnabled();
      await expect
        .element(page.getByRole('button', { name: /^Reading date:/ }))
        .toBeEnabled();
    } finally {
      view.cleanup();
    }
  });

  it('displays API errors and lets the user retry', async () => {
    const api = mockLectServe({ fail: true });
    const view = await renderLectionary();
    try {
      await expect
        .element(page.getByRole('alert'))
        .toHaveTextContent('Unable to load the lectionary');
      api.recover();
      await page.getByRole('button', { name: 'Retry' }).click();
      await expect
        .element(page.getByRole('link', { name: 'Matthew 22:34-46' }))
        .toBeVisible();
    } finally {
      view.cleanup();
    }
  });
});
