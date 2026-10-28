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
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Reference } from './Reference';

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
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe('USFM reference links', () => {
  it.each([
    ['JHN 1:1-5', 'John 1:1-5', 'JHN', '1'],
    ['HEB 11:1-3', 'Hebrews 11:1-3', 'HEB', '11'],
  ])(
    'links %s within the current translation',
    async (target, label, book, chapter) => {
      const html = await renderReference(target, label);
      const href = /href="([^"]+)"/.exec(html)?.[1];

      expect(href).toBeDefined();
      const url = new URL(href!, 'https://margins.test');
      expect(url.pathname).toBe(`/msb/${book}/${chapter}`);
      expect(JSON.parse(url.searchParams.get('verses')!)).toBe('1');
      expect(url.hash).toBe(`#verse-${book}/${chapter}:1`);
      expect(html).toContain(label);
      expect(html).toContain('<a ');
    },
  );

  it('links chapter-only references without a verse selection', async () => {
    const html = await renderReference('JHN 1', 'John 1');
    expect(html).toContain('href="/msb/JHN/1"');
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
      flushSync(() => root.render(createElement(RouterProvider, { router })));
      const link = container.querySelector('a');
      expect(link?.textContent).toBe('John 1:3-5');
      link!.click();
      await expect
        .poll(() => router.state.location.pathname)
        .toBe('/msb/JHN/1');
      expect(router.state.location.search).toEqual({ verses: '3' });
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
      viewport.style.cssText = 'height: 200px; overflow-y: auto';
      const before = document.createElement('div');
      before.style.height = '1000px';
      const target = document.createElement('div');
      target.id = 'verse-JHN/1:3';
      target.style.height = '30px';
      const after = document.createElement('div');
      after.style.height = '2000px';
      viewport.append(before, target, after);
      scrollArea.append(viewport);
      document.body.append(container, scrollArea);
      const root = createRoot(container);

      try {
        flushSync(() => root.render(createElement(RouterProvider, { router })));
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
              return (
                targetRect.top >= viewportRect.top &&
                targetRect.bottom <= viewportRect.bottom
              );
            })
            .toBe(true);
        }
      } finally {
        root.unmount();
        container.remove();
        scrollArea.remove();
      }
    },
  );
});
