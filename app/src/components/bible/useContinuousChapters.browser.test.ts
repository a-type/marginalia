import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

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
