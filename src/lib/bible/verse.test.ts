import { describe, expect, it } from 'vitest';

import { formatVerseId, isValidVerseId, parseVerseId } from './verse';

describe('VerseId', () => {
  it('accepts translation-defined book IDs', () => {
    const verseId = formatVerseId('CUSTOM-BOOK', 12, 3);

    expect(isValidVerseId(verseId)).toBe(true);
    expect(parseVerseId(verseId)).toEqual({
      bookId: 'CUSTOM-BOOK',
      chapter: 12,
      verse: 3,
    });
  });

  it('rejects malformed delimiters and non-positive numbers', () => {
    expect(isValidVerseId('/1:1')).toBe(false);
    expect(isValidVerseId('BOOK/0:1')).toBe(false);
    expect(isValidVerseId('BOOK/1:0')).toBe(false);
    expect(isValidVerseId('BOOK/1:1:2')).toBe(false);
    expect(isValidVerseId('BOOK/1/1:1')).toBe(false);
  });
});
