import { describe, expect, it } from 'vitest';

import {
  parseBibleLocation,
  parseBibleReference,
  parseScriptureCitation,
} from './location';

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
  it.each([
    ['JHN 1:1', '1'],
    ['JHN 1:1-5', '1-5'],
    ['JHN 1:1-2:3', '1-2:3'],
  ])('selects the verses of %s', (reference, verses) => {
    expect(parseBibleReference(reference)).toEqual({
      bookId: 'JHN',
      chapter: 1,
      verse: 1,
      verses,
    });
  });

  it('accepts numbered books, chapter references, and surrounding whitespace', () => {
    expect(parseBibleReference(' 1CO 13 ')).toEqual({
      bookId: '1CO',
      chapter: 13,
      verses: 'start-end',
    });
    expect(parseBibleReference('HEB 11:1-3')).toEqual({
      bookId: 'HEB',
      chapter: 11,
      verse: 1,
      verses: '1-3',
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

describe('parseScriptureCitation', () => {
  it.each([
    ['Matthew 22:34-46', 'MAT', 22, 34, '34-46'],
    ['1 Thessalonians 2:1-8', '1TH', 2, 1, '1-8'],
    ['Psalm 90:1-6, 13-17', 'PSA', 90, 1, '1-6,13-17'],
    ['Song of Songs 2:8-13', 'SNG', 2, 8, '8-13'],
    ['Sirach 35:12-17', 'SIR', 35, 12, '12-17'],
    ['Wisdom of Solomon 3:1-9', 'WIS', 3, 1, '1-9'],
    ['II Corinthians 5:20b-6:10', '2CO', 5, 20, '20-6:10'],
    ['John 1:(1-9), 10-18', 'JHN', 1, 1, '1-9,10-18'],
    ['Isaiah 52:13–53:12', 'ISA', 52, 13, '13-53:12'],
    ['1 Maccabees 2:49-end', '1MA', 2, 49, '49-end'],
    ['Ephesians (1:11-14); 1:15-23', 'EPH', 1, 11, '11-14,1:15-23'],
    ['Luke 6:20-26; (6:27-36)', 'LUK', 6, 20, '20-26,6:27-36'],
    ['  Psalm 23  ', 'PSA', 23, undefined, 'start-end'],
    ['Genesis 1-3', 'GEN', 1, undefined, '1:start-3:end'],
    ['John 1:4-2:3, 5-7', 'JHN', 1, 4, '4-2:3,2:5-2:7'],
    ['Luke 1:39-45(46-55)', 'LUK', 1, 39, '39-45,46-55'],
    ['John 3:start-end', 'JHN', 3, undefined, 'start-end'],
  ])('selects the verses of %s', (citation, bookId, chapter, verse, verses) => {
    expect(parseScriptureCitation(citation)).toEqual({
      bookId,
      chapter,
      ...(verse === undefined ? {} : { verse }),
      verses,
    });
  });

  it.each([
    '',
    'Unknown 1:1',
    'John',
    'John 0:1',
    'John 1:0',
    'John 1junk',
    'John 1:1junk',
    'John 9007199254740992:1',
    'John 1:9007199254740992',
  ])('rejects unresolvable citation %s', (citation) => {
    expect(parseScriptureCitation(citation)).toBeNull();
  });
});
