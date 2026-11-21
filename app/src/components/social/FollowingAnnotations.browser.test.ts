import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { listFollowingAnnotationsPage } from '../../lib/annotations/functions';
import { profilesForDidsQueryOptions } from '../../queries/social';
import { translationBookVersesQueryOptions } from '../../queries/translations';
import { FollowingAnnotations } from './FollowingAnnotations';

vi.mock('../../lib/annotations/functions', () => ({
  listFollowingAnnotationsPage: vi.fn(),
}));

it('shows two-line previews, appends the next page, and opens an annotation in a reading tab', async () => {
  const accountDid = 'did:plc:reader';
  const authorDid = 'did:plc:friend';
  const firstId = `at://${authorDid}/com.marginsbible.annotation/first`;
  const secondId = `at://${authorDid}/com.marginsbible.annotation/second`;
  const translationId = 'eng_asv';
  const annotation = {
    id: firstId,
    uri: firstId,
    authorDid,
    rkey: 'first',
    cid: null,
    bookId: 'JHN',
    chapter: 3,
    chapterKeys: ['JHN/3'],
    verses: ['JHN/3:1', 'JHN/3:2'],
    comment: 'A long observation. '.repeat(30),
    createdAt: '2026-10-29T12:00:00Z',
    status: 'synced',
    syncError: null,
  } satisfies Awaited<
    ReturnType<typeof listFollowingAnnotationsPage>
  >['annotations'][number];
  const loadPage = vi.mocked(listFollowingAnnotationsPage);
  loadPage.mockImplementation(async ({ data }) =>
    data.cursor
      ? {
          annotations: [
            {
              ...annotation,
              id: secondId,
              uri: secondId,
              comment: 'Earlier observation.',
            },
          ],
        }
      : { annotations: [annotation], cursor: 'next' },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(profilesForDidsQueryOptions([authorDid]).queryKey, [
    {
      authorDid,
      handle: 'friend.example',
      avatar:
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      uri: `at://${authorDid}/com.marginsbible.profile/self`,
      cid: null,
      displayName: null,
      description: null,
      createdAt: annotation.createdAt,
    },
  ]);
  client.setQueryData(
    translationBookVersesQueryOptions(translationId, 'JHN').queryKey,
    {
      available: true,
      title: 'ASV',
      language: 'en',
      verses: [
        {
          id: 'JHN/3:1',
          label: '1',
          text: 'First verse in the current translation. '.repeat(25),
        },
        {
          id: 'JHN/3:2',
          label: '2',
          text: 'Second verse in the current translation.',
        },
      ],
    },
  );
  const rootRoute = createRootRoute();
  const feedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/social',
    component: () =>
      createElement(FollowingAnnotations, { accountDid, translationId }),
  });
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    component: () => createElement('p', null, 'Reading tab'),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([feedRoute, readerRoute]),
    history: createMemoryHistory({ initialEntries: ['/social'] }),
  });
  vi.spyOn(router, 'startViewTransition').mockImplementation((update) =>
    update(),
  );

  const storageKeys = ['margins:reading-tabs', 'margins:visited-before'];
  const storageValues = storageKeys.map((key) => localStorage.getItem(key));
  const container = document.createElement('div');
  container.style.width = '300px';
  document.body.append(container);
  const root = createRoot(container);
  try {
    await router.load();
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(RouterProvider, { router }),
      ),
    );
    await expect.element(page.getByText('@friend.example')).toBeVisible();
    expect(container.querySelector('article img')?.getAttribute('src')).toMatch(
      /^data:image/,
    );
    await expect
      .element(page.getByText(/Second verse in the current translation/))
      .toBeVisible();
    await expect.element(page.getByText(/A long observation/)).toBeVisible();
    const excerpts = container.querySelectorAll<HTMLElement>(
      'article blockquote, article p',
    );
    expect(excerpts).toHaveLength(2);
    for (const excerpt of excerpts) {
      expect(getComputedStyle(excerpt).webkitLineClamp).toBe('2');
      expect(excerpt.scrollHeight).toBeGreaterThan(excerpt.clientHeight);
    }

    await page.getByRole('button', { name: 'Load more annotations' }).click();
    await expect.element(page.getByText('Earlier observation.')).toBeVisible();
    expect(loadPage).toHaveBeenLastCalledWith({ data: { cursor: 'next' } });
    await expect
      .element(page.getByRole('button', { name: 'Load more annotations' }))
      .not.toBeInTheDocument();

    await page
      .getByRole('button', { name: /Open in context/ })
      .first()
      .click();
    await expect.element(page.getByText('Reading tab')).toBeVisible();
    expect(router.state.location.pathname).toBe('/eng_asv/JHN/3');
    expect(router.state.location.search).toMatchObject({
      verses: 'JHN/3:1,JHN/3:2',
      annotation: firstId,
    });
    expect(router.state.location.state.activeReadingTabId).toBeTruthy();
  } finally {
    root.unmount();
    container.remove();
    client.clear();
    storageKeys.forEach((key, index) => {
      const value = storageValues[index];
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
  }
});
