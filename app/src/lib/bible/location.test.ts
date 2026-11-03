import { describe, expect, it } from 'vitest';

import {
  parseBibleLocation,
  parseBibleReference,
  parseScriptureCitation,
  referenceVerseSelection,
} from './location';
import { resolveVerseSelection } from './selection';
import { formatVerseId } from './verse';

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
    ['JHN 1:1', 'JHN/1:1'],
    ['JHN 1:1-5', 'JHN/1:1-JHN/1:5'],
    ['JHN 1:1-2:3', 'JHN/1:1-JHN/2:3'],
  ])('selects the verses of %s', (reference, verses) => {
    const parsed = parseBibleReference(reference)!;
    expect(parsed).toMatchObject({
      bookId: 'JHN',
      chapter: 1,
      verse: 1,
    });
    expect(referenceVerseSelection(parsed)).toBe(verses);
  });

  it('accepts numbered books, chapter references, and surrounding whitespace', () => {
    expect(parseBibleReference(' 1CO 13 ')).toMatchObject({
      bookId: '1CO',
      chapter: 13,
      verseLabel: 'start-end',
    });
    expect(parseBibleReference('HEB 11:1-3')).toMatchObject({
      bookId: 'HEB',
      chapter: 11,
      verse: 1,
      verseLabel: '1-3',
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
    ['2 Chronicles 29 † 1-11,20-30,35-36', '2CH', 29, 1, '1-11,20-30,35-36'],
    ['Psalm 23†4', 'PSA', 23, 4, '4'],
    ['John 3 † 16, 18–21', 'JHN', 3, 16, '16,18-21'],
  ])('selects the verses of %s', (citation, bookId, chapter, verse, verses) => {
    expect(parseScriptureCitation(citation)).toMatchObject({
      bookId,
      chapter,
      ...(verse === undefined ? {} : { verse }),
      verseLabel: verses,
    });
  });

  it("resolves chapter boundaries using the translation's actual verses", () => {
    const verses = [
      'GEN/1:2',
      'GEN/1:4',
      'GEN/2:1',
      'GEN/3:3',
      'GEN/3:7',
    ] as const;
    const chapters = parseScriptureCitation('Genesis 1-3')!;
    expect(referenceVerseSelection(chapters)).toBeUndefined();
    expect(referenceVerseSelection(chapters, verses)).toBe('GEN/1:2-GEN/3:7');
    expect(
      referenceVerseSelection(
        parseScriptureCitation('Genesis 1:4-end')!,
        verses,
      ),
    ).toBe('GEN/1:4');
    expect(
      referenceVerseSelection(parseScriptureCitation('Genesis 4')!, verses),
    ).toBeUndefined();
  });

  it('selects only the specified verses from a dagger-delimited chapter', () => {
    const reference = parseScriptureCitation(
      '2 Chronicles 29 † 1-11,20-30,35-36',
    )!;
    const availableVerses = Array.from({ length: 36 }, (_, index) =>
      formatVerseId('2CH', 29, index + 1),
    );

    expect(
      resolveVerseSelection(
        referenceVerseSelection(reference)!,
        availableVerses,
      ),
    ).toEqual([
      ...availableVerses.slice(0, 11),
      ...availableVerses.slice(19, 30),
      ...availableVerses.slice(34, 36),
    ]);
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
    'John 3 †',
    'John 3 † 0',
    'John 3 † 16junk',
    'John 3 † 16 † 18',
  ])('rejects unresolvable citation %s', (citation) => {
    expect(parseScriptureCitation(citation)).toBeNull();
  });
});
