import { describe, expect, it } from 'vitest';

import { getAdjacentChapter } from './navigation';
import type { TranslationManifest } from './source';

const manifest: TranslationManifest = {
  id: 'web',
  title: 'World English Bible',
  books: [
    { id: 'GEN', title: 'Genesis', chapters: 50, source: 'gen.usfm' },
    { id: 'EXO', title: 'Exodus', chapters: 40, source: 'exo.usfm' },
    { id: 'REV', title: 'Revelation', chapters: 22, source: 'rev.usfm' },
  ],
};

describe('chapter navigation', () => {
  it('moves to neighboring chapters within a book', () => {
    const location = { bookId: 'GEN', chapter: 2 } as const;
    expect(getAdjacentChapter(manifest, location, -1)).toEqual({
      bookId: 'GEN',
      chapter: 1,
    });
    expect(getAdjacentChapter(manifest, location, 1)).toEqual({
      bookId: 'GEN',
      chapter: 3,
    });
  });

  it('crosses book boundaries in translation order', () => {
    expect(
      getAdjacentChapter(manifest, { bookId: 'GEN', chapter: 50 }, 1),
    ).toEqual({ bookId: 'EXO', chapter: 1 });
    expect(
      getAdjacentChapter(manifest, { bookId: 'EXO', chapter: 1 }, -1),
    ).toEqual({ bookId: 'GEN', chapter: 50 });
  });

  it('wraps between the first and last chapters of the translation', () => {
    expect(
      getAdjacentChapter(manifest, { bookId: 'GEN', chapter: 1 }, -1),
    ).toEqual({ bookId: 'REV', chapter: 22 });
    expect(
      getAdjacentChapter(manifest, { bookId: 'REV', chapter: 22 }, 1),
    ).toEqual({ bookId: 'GEN', chapter: 1 });
  });

  it('has no target for a chapter absent from the translation', () => {
    expect(
      getAdjacentChapter(manifest, { bookId: 'JUD', chapter: 1 }, 1),
    ).toBeUndefined();
  });
});
