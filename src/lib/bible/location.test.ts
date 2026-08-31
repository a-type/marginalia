import { describe, expect, it } from 'vitest';

import { parseBibleLocation } from './location';

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
