import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type * as BibleSource from '../../lib/bible/source';
import { Reference } from './Reference';

const { fetchManifest, fetchSource } = vi.hoisted(() => ({
  fetchManifest: vi.fn(),
  fetchSource: vi.fn(),
}));
vi.mock('../../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationManifest: fetchManifest,
  fetchTranslationSource: fetchSource,
}));
afterEach(() => vi.clearAllMocks());

async function createReferenceRouter(target: string, label: string) {
  const rootRoute = createRootRoute();
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    component: () =>
      createElement(Reference, {
        node: {
          type: 'marker',
          marker: 'ref',
          category: 'character',
          attributes: { loc: target },
          children: [{ type: 'text', value: label }],
          closed: true,
        },
        marker: 'ref',
        category: 'character',
        attributes: { loc: target },
        children: label,
      }),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([readerRoute]),
    history: createMemoryHistory({ initialEntries: ['/msb/GEN/1'] }),
    scrollRestoration: true,
    scrollToTopSelectors: [
      '[data-reader-scroll-area] [data-scroll-direction="vertical"]',
    ],
  });
  await router.load();
  return router;
}

async function renderReference(target: string, label: string) {
  const router = await createReferenceRouter(target, label);
  return renderToStaticMarkup(
    withQueryClient(createElement(RouterProvider, { router })),
  );
}

function withQueryClient(child: ReactNode, client?: QueryClient) {
  if (!client) {
    client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    client.setQueryData(['translation-book-verses', 'msb', 'JHN'], {
      available: true,
      title: 'Test',
      verses: [
        { id: 'JHN/1:1', label: '1', text: 'First' },
        { id: 'JHN/1:51', label: '51', text: 'Last' },
      ],
    });
  }
  return createElement(QueryClientProvider, { client }, child);
}

describe('USFM reference links', () => {
  it.each([
    ['JHN 1:1-5', 'John 1:1-5', 'JHN', '1', 'JHN/1:1-JHN/1:5'],
    ['HEB 11:1-3', 'Hebrews 11:1-3', 'HEB', '11', 'HEB/11:1-HEB/11:3'],
    ['JHN 1:1-2:3', 'John 1:1-2:3', 'JHN', '1', 'JHN/1:1-JHN/2:3'],
  ])(
    'links %s within the current translation',
    async (target, label, book, chapter, verses) => {
      const html = await renderReference(target, label);
      const href = /href="([^"]+)"/.exec(html)?.[1];

      expect(href).toBeDefined();
      const url = new URL(href!, 'https://margins.test');
      expect(url.pathname).toBe(`/msb/${book}/${chapter}`);
      expect(url.searchParams.get('verses')).toBe(verses);
      expect(url.hash).toBe(`#verse-${book}/${chapter}:1`);
      expect(html).toContain(label);
      expect(html).toContain('<a ');
    },
  );

  it('selects the whole chapter for chapter-only references', async () => {
    const html = await renderReference('JHN 1', 'John 1');
    const href = /href="([^"]+)"/.exec(html)?.[1];
    const url = new URL(href!, 'https://margins.test');
    expect(url.pathname).toBe('/msb/JHN/1');
    expect(url.searchParams.get('verses')).toBe('JHN/1:1-JHN/1:51');
  });

  it('resolves a whole chapter from the translation after loading', async () => {
    fetchManifest.mockResolvedValue({
      id: 'msb',
      title: 'Test',
      books: [{ id: 'JHN', title: 'John', chapters: 1 }],
    });
    let finish!: (source: string) => void;
    fetchSource.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    const client = new QueryClient();
    const router = await createReferenceRouter('JHN 1', 'John 1');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      flushSync(() =>
        root.render(
          withQueryClient(createElement(RouterProvider, { router }), client),
        ),
      );
      await expect
        .element(page.getByRole('status'))
        .toHaveTextContent('Loading referenced passage');
      expect(container.querySelector('a')).toBeNull();
      await expect.poll(() => fetchSource.mock.calls.length).toBe(1);
      finish('\\id JHN\n\\c 1\n\\p\n\\v 2 First\n\\v 7 Last');
      await expect
        .element(page.getByRole('link', { name: 'John 1' }))
        .toBeVisible();
      const url = new URL(container.querySelector('a')!.href);
      expect(url.searchParams.get('verses')).toBe('JHN/1:2-JHN/1:7');
    } finally {
      root.unmount();
      container.remove();
      client.clear();
    }
  });

  it('reports a failed chapter lookup and allows retrying', async () => {
    fetchManifest.mockResolvedValue({
      id: 'msb',
      title: 'Test',
      books: [{ id: 'JHN', title: 'John', chapters: 1 }],
    });
    fetchSource.mockRejectedValue(new Error('Unavailable'));
    const client = new QueryClient();
    const router = await createReferenceRouter('JHN 1', 'John 1');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      flushSync(() =>
        root.render(
          withQueryClient(createElement(RouterProvider, { router }), client),
        ),
      );
      await expect
        .element(page.getByRole('alert'))
        .toHaveTextContent('This passage is unavailable');
      fetchSource.mockResolvedValue(
        '\\id JHN\n\\c 1\n\\p\n\\v 1 First\n\\v 3 Last',
      );
      await page.getByRole('button', { name: 'Retry' }).click();
      await expect
        .element(page.getByRole('link', { name: 'John 1' }))
        .toBeVisible();
      expect(
        new URL(container.querySelector('a')!.href).searchParams.get('verses'),
      ).toBe('JHN/1:1-JHN/1:3');
    } finally {
      root.unmount();
      container.remove();
      client.clear();
    }
  });

  it('keeps invalid targets readable without creating broken links', async () => {
    const html = await renderReference('not a reference', 'John 1:1-5');
    expect(html).toContain('John 1:1-5');
    expect(html).not.toContain('<a ');
  });

  it('navigates to the referenced verse when clicked', async () => {
    const router = await createReferenceRouter('JHN 1:3-5', 'John 1:3-5');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    try {
      flushSync(() =>
        root.render(withQueryClient(createElement(RouterProvider, { router }))),
      );
      const link = container.querySelector('a');
      expect(link?.textContent).toBe('John 1:3-5');
      link!.click();
      await expect
        .poll(() => router.state.location.pathname)
        .toBe('/msb/JHN/1');
      expect(router.state.location.search).toEqual({
        verses: 'JHN/1:3-JHN/1:5',
      });
    } finally {
      root.unmount();
      container.remove();
    }
  });

  it.each([
    ['JHN 1:3-5', 'verse'],
    ['JHN 1', 'chapter'],
  ])(
    'scrolls a nested reader viewport to the linked %s',
    async (reference, kind) => {
      const router = await createReferenceRouter(reference, reference);
      const container = document.createElement('div');
      const scrollArea = document.createElement('div');
      scrollArea.dataset.readerScrollArea = '';
      const viewport = document.createElement('div');
      viewport.dataset.scrollDirection = 'vertical';
      viewport.style.cssText =
        'height: 200px; overflow-y: auto; scroll-padding-top: 40px';
      const before = document.createElement('div');
      before.style.height = '1000px';
      const target = document.createElement('div');
      target.id = 'verse-JHN/1:3';
      target.style.cssText = 'height: 30px; scroll-margin-top: 20px';
      const after = document.createElement('div');
      after.style.height = '2000px';
      viewport.append(before, target, after);
      scrollArea.append(viewport);
      document.body.append(container, scrollArea);
      const root = createRoot(container);

      try {
        flushSync(() =>
          root.render(
            withQueryClient(createElement(RouterProvider, { router })),
          ),
        );
        viewport.scrollTop = 1900;
        expect(viewport.scrollTop).toBe(1900);
        container.querySelector('a')!.click();
        await expect
          .poll(() => router.state.location.pathname)
          .toBe('/msb/JHN/1');

        if (kind === 'chapter') {
          await expect.poll(() => viewport.scrollTop).toBe(0);
        } else {
          await expect
            .poll(() => {
              const viewportRect = viewport.getBoundingClientRect();
              const targetRect = target.getBoundingClientRect();
              return Math.round(targetRect.top - viewportRect.top);
            })
            .toBe(60);
        }
      } finally {
        root.unmount();
        container.remove();
        scrollArea.remove();
      }
    },
  );
});
