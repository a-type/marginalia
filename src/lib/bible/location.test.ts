import { describe, expect, it } from 'vitest';

import { parseBibleLocation, parseBibleReference } from './location';

describe('parseBibleLocation', () => {
  it('accepts translation-defined book IDs and positive chapters', () => {
    expect(parseBibleLocation('GEN', '1')).toEqual({
      bookId: 'GEN',
      chapter: 1,
    });
    expect(parseBibleLocation('CUSTOM-BOOK', 51)).toEqual({
      bookId: 'CUSTOM-BOOK',
      chapter: 51,
    });
  });

  it('rejects empty book IDs and invalid chapters', () => {
    expect(parseBibleLocation('', 1)).toBeNull();
    expect(parseBibleLocation('GEN', 0)).toBeNull();
    expect(parseBibleLocation('GEN', 1.5)).toBeNull();
  });
});

describe('parseBibleReference', () => {
  it.each(['JHN 1:1', 'JHN 1:1-5', 'JHN 1:1-2:3'])(
    'locates the first verse of %s',
    (reference) => {
      expect(parseBibleReference(reference)).toEqual({
        bookId: 'JHN',
        chapter: 1,
        verse: 1,
      });
    },
  );

  it('accepts numbered books, chapter references, and surrounding whitespace', () => {
    expect(parseBibleReference(' 1CO 13 ')).toEqual({
      bookId: '1CO',
      chapter: 13,
    });
    expect(parseBibleReference('HEB 11:1-3')).toEqual({
      bookId: 'HEB',
      chapter: 11,
      verse: 1,
    });
  });

  it.each([
    undefined,
    '',
    'John',
    'JHN 0:1',
    'JHN 1:0',
    'JHN 1:1junk',
    'JHN 9007199254740992:1',
    'JHN 1:9007199254740992',
    'https://example.com 1:1',
  ])('rejects invalid reference %s', (reference) => {
    expect(parseBibleReference(reference)).toBeNull();
  });
});
