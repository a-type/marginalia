import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { BibleLocation } from '../../lib/bible/location';
import type { TranslationManifest } from '../../lib/bible/source';
import { useContinuousChapters } from './useContinuousChapters';

const manifest: TranslationManifest = {
  id: 'test',
  title: 'Test',
  books: [
    { id: 'GEN', title: 'Genesis', chapters: 3, source: 'gen.usfm' },
    { id: 'EXO', title: 'Exodus', chapters: 3, source: 'exo.usfm' },
  ],
};

function renderChapters(location: BibleLocation) {
  const client = new QueryClient();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  function Chapters() {
    const { chapters } = useContinuousChapters({
      location,
      manifest,
      sources: manifest.books.map((book) => ({
        bookId: book.id,
        source: 'source',
      })),
      translationId: manifest.id,
      readingPosition: undefined,
    });
    return chapters
      .map((chapter) => `${chapter.bookId}/${chapter.chapter}`)
      .join(',');
  }

  flushSync(() =>
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Chapters)),
    ),
  );
  const result = container.textContent;
  flushSync(() => root.unmount());
  container.remove();
  client.clear();
  return result;
}

describe('continuous chapter buffer', () => {
  it('includes two chapters on each side across book boundaries', () => {
    expect(renderChapters({ bookId: 'EXO', chapter: 1 })).toBe(
      'GEN/2,GEN/3,EXO/1,EXO/2,EXO/3',
    );
  });

  it('stops at the beginning and end of the translation', () => {
    expect(renderChapters({ bookId: 'GEN', chapter: 1 })).toBe(
      'GEN/1,GEN/2,GEN/3',
    );
    expect(renderChapters({ bookId: 'EXO', chapter: 3 })).toBe(
      'EXO/1,EXO/2,EXO/3',
    );
  });
});

describe('continuous scroll space', () => {
  const longManifest: TranslationManifest = {
    id: 'long-test',
    title: 'Test',
    books: [
      { id: 'GEN', title: 'Genesis', chapters: 8, source: 'gen.usfm' },
      { id: 'EXO', title: 'Exodus', chapters: 8, source: 'exo.usfm' },
    ],
  };

  function renderScrollArea(
    location: BibleLocation,
    options: {
      readingPosition?: BibleLocation;
      sources?: { bookId: string; source: string }[];
    } = {},
  ) {
    const client = new QueryClient();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    function Reader() {
      const {
        active,
        chapters,
        getSource,
        viewportRef,
        contentRef,
        beforeRef,
        afterRef,
        onScroll,
        startScrubbing,
        finishScrubbing,
      } = useContinuousChapters({
        location,
        manifest: longManifest,
        sources:
          options.sources ??
          longManifest.books.map((book) => ({
            bookId: book.id,
            source: 'source',
          })),
        translationId: longManifest.id,
        readingPosition: options.readingPosition,
      });
      return createElement(
        'div',
        null,
        createElement('button', {
          'data-action': 'start',
          onClick: () => startScrubbing(1),
        }),
        createElement('button', {
          'data-action': 'finish',
          onClick: () => finishScrubbing(1),
        }),
        createElement(
          'div',
          {
            'data-test-reader-viewport': '',
            ref: viewportRef,
            'data-active': `${active.bookId}/${active.chapter}`,
            onScroll,
            style: { height: 150, overflowY: 'auto' },
          },
          createElement(
            'div',
            { ref: contentRef },
            createElement('div', { ref: beforeRef, 'data-buffer': 'before' }),
            ...chapters.map((chapter) => {
              const loaded = getSource(chapter.bookId).data !== undefined;
              return createElement('section', {
                key: `${chapter.bookId}/${chapter.chapter}`,
                'data-reader-chapter': `${chapter.bookId}/${chapter.chapter}`,
                'data-reader-chapter-loaded': loaded,
                style: { height: loaded ? 240 : 20 },
              });
            }),
            createElement('div', { ref: afterRef, 'data-buffer': 'after' }),
          ),
        ),
      );
    }

    flushSync(() =>
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Reader)),
      ),
    );
    const viewport = container.querySelector<HTMLElement>(
      '[data-test-reader-viewport]',
    )!;
    return {
      viewport,
      get before() {
        return container.querySelector<HTMLElement>('[data-buffer="before"]')!;
      },
      get after() {
        return container.querySelector<HTMLElement>('[data-buffer="after"]')!;
      },
      startScrubbing() {
        flushSync(() =>
          container
            .querySelector<HTMLButtonElement>('[data-action="start"]')!
            .click(),
        );
      },
      finishScrubbing() {
        flushSync(() =>
          container
            .querySelector<HTMLButtonElement>('[data-action="finish"]')!
            .click(),
        );
      },
      loadBook(bookId: string) {
        client.setQueryData(
          ['reader-book-source', longManifest.id, bookId],
          'source',
        );
      },
      cleanup() {
        flushSync(() => root.unmount());
        container.remove();
        client.clear();
      },
    };
  }

  it('estimates space on both sides and stops at translation boundaries', () => {
    for (const [location, before, after] of [
      [{ bookId: 'GEN', chapter: 1 }, 0, 13],
      [{ bookId: 'EXO', chapter: 1 }, 6, 5],
      [{ bookId: 'EXO', chapter: 8 }, 13, 0],
    ] as const) {
      const reader = renderScrollArea(location);
      try {
        expect(reader.before.getBoundingClientRect().height).toBe(before * 240);
        expect(reader.after.getBoundingClientRect().height).toBe(after * 240);
      } finally {
        reader.cleanup();
      }
    }
  });

  it('loads the chapter reached by jumping into either estimated buffer', async () => {
    const reader = renderScrollArea({ bookId: 'EXO', chapter: 1 });
    try {
      const jumpTo = (buffer: HTMLElement, offset: number) => {
        reader.viewport.scrollTop +=
          buffer.getBoundingClientRect().top -
          reader.viewport.getBoundingClientRect().top +
          offset;
        reader.viewport.dispatchEvent(new Event('scroll'));
      };
      jumpTo(reader.after, 3.5 * 240);
      await vi.waitFor(() =>
        expect(reader.viewport.dataset.active).toBe('EXO/7'),
      );
      expect(reader.viewport.scrollTop).toBeGreaterThan(0);

      jumpTo(reader.before, 1.5 * 240);
      await vi.waitFor(() =>
        expect(reader.viewport.dataset.active).toBe('GEN/2'),
      );
      const active = reader.viewport.querySelector<HTMLElement>(
        '[data-reader-chapter="GEN/2"]',
      )!;
      expect(
        reader.viewport.getBoundingClientRect().top -
          active.getBoundingClientRect().top,
      ).toBeCloseTo(120, 0);
    } finally {
      reader.cleanup();
    }
  });

  it('updates estimates after chapter resizing without moving the visible chapter', async () => {
    const reader = renderScrollArea({ bookId: 'EXO', chapter: 1 });
    try {
      const active = reader.viewport.querySelector<HTMLElement>(
        '[data-reader-chapter="EXO/1"]',
      )!;
      const later = reader.viewport.querySelector<HTMLElement>(
        '[data-reader-chapter="EXO/3"]',
      )!;
      const top = active.getBoundingClientRect().top;
      later.style.height = '480px';
      await vi.waitFor(() =>
        expect(reader.before.getBoundingClientRect().height).toBe(6 * 288),
      );
      expect(reader.after.getBoundingClientRect().height).toBe(5 * 288);
      expect(active.getBoundingClientRect().top).toBeCloseTo(top, 0);
    } finally {
      reader.cleanup();
    }
  });

  it('waits for a restored chapter and preserves it while earlier content loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const reader = renderScrollArea(
      { bookId: 'GEN', chapter: 1 },
      { readingPosition: { bookId: 'EXO', chapter: 2 }, sources: [] },
    );
    const target = reader.viewport.querySelector<HTMLElement>(
      '[data-reader-chapter="EXO/2"]',
    )!;

    try {
      expect(target.dataset.readerChapterLoaded).toBe('false');

      reader.loadBook('EXO');
      await vi.waitFor(() => {
        expect(target.dataset.readerChapterLoaded).toBe('true');
        expect(
          target.getBoundingClientRect().top -
            reader.viewport.getBoundingClientRect().top,
        ).toBeCloseTo(0, 0);
      });

      const targetTop = target.getBoundingClientRect().top;
      reader.loadBook('GEN');
      await vi.waitFor(() =>
        expect(target.getBoundingClientRect().top).toBeCloseTo(targetTop, 0),
      );
    } finally {
      reader.cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('aligns the selected chapter after scrubbing within and outside the window', async () => {
    const reader = renderScrollArea({ bookId: 'EXO', chapter: 1 });
    try {
      const expectAtTop = async (id: string) => {
        await vi.waitFor(() => {
          expect(reader.viewport.dataset.active).toBe(id);
          const chapter = reader.viewport.querySelector<HTMLElement>(
            `[data-reader-chapter="${id}"]`,
          )!;
          expect(
            chapter.getBoundingClientRect().top -
              reader.viewport.getBoundingClientRect().top,
          ).toBeCloseTo(0, 0);
        });
      };
      const scrubToLoaded = (id: string) => {
        reader.startScrubbing();
        const chapter = reader.viewport.querySelector<HTMLElement>(
          `[data-reader-chapter="${id}"]`,
        )!;
        reader.viewport.scrollTop +=
          chapter.getBoundingClientRect().top -
          reader.viewport.getBoundingClientRect().top +
          80;
        reader.finishScrubbing();
      };

      scrubToLoaded('EXO/1');
      await expectAtTop('EXO/1');
      scrubToLoaded('EXO/2');
      await expectAtTop('EXO/2');

      reader.startScrubbing();
      reader.viewport.scrollTop +=
        reader.after.getBoundingClientRect().top -
        reader.viewport.getBoundingClientRect().top +
        2.5 * 240;
      reader.finishScrubbing();
      await expectAtTop('EXO/7');

      const last = reader.viewport.querySelector<HTMLElement>(
        '[data-reader-chapter="EXO/8"]',
      )!;
      last.style.height = '40px';
      await vi.waitFor(() =>
        expect(reader.after.getBoundingClientRect().height).toBe(110),
      );
      scrubToLoaded('EXO/8');
      await expectAtTop('EXO/8');
    } finally {
      reader.cleanup();
    }
  });
});
