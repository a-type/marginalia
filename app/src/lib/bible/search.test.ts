import { describe, expect, it } from 'vitest';
import {
  getAnnotatedVerseIds,
  getBibleSearchBookIds,
  extractVerses,
  isBibleSearchBookFilter,
  matchesSearch,
  parseSearchQuery,
  searchRanges,
  tokenize,
} from './search';
import type { AnnotationRecord } from '../annotations/collections';
import type { HighlightRecord } from '../highlights/collections';

describe('Bible search', () => {
  it('combines only the active user and local annotations, ordered by creation time', () => {
    const note = (
      authorDid: string | null,
      createdAt: string,
      verses: AnnotationRecord['verses'],
    ): AnnotationRecord => ({
      id: createdAt,
      rkey: createdAt,
      uri: null,
      cid: null,
      authorDid,
      bookId: 'GEN',
      chapter: 1,
      chapterKeys: ['GEN/1'],
      verses,
      comment: 'note',
      createdAt,
      status: 'pending',
      syncError: null,
    });
    const highlight = (
      authorDid: string | null,
      createdAt: string,
      verseId: HighlightRecord['verseId'],
      status: HighlightRecord['status'] = 'synced',
    ): HighlightRecord => ({
      id: createdAt,
      rkey: createdAt,
      uri: null,
      cid: null,
      authorDid,
      verseId,
      bookId: 'GEN',
      chapter: 1,
      verse: 1,
      color: 'lemon',
      createdAt,
      status,
      syncError: null,
    });
    const notes = [
      note('me', '2020-01-01T00:00:00Z', ['GEN/1:1', 'GEN/1:2']),
      note('other', '2018-01-01T00:00:00Z', ['GEN/1:3']),
      note(null, '2022-01-01T00:00:00Z', ['GEN/1:4']),
    ];
    const highlights = [
      highlight('me', '2023-01-01T00:00:00Z', 'GEN/1:1'),
      highlight('me', '2019-01-01T00:00:00Z', 'GEN/1:5', 'deleting'),
      highlight('other', '2024-01-01T00:00:00Z', 'GEN/1:6'),
    ];
    expect(getAnnotatedVerseIds(notes, highlights, 'me', 'newest')).toEqual([
      'GEN/1:1',
      'GEN/1:4',
      'GEN/1:2',
    ]);
    expect(getAnnotatedVerseIds(notes, highlights, 'me', 'oldest')).toEqual([
      'GEN/1:1',
      'GEN/1:2',
      'GEN/1:4',
    ]);
    expect(getAnnotatedVerseIds(notes, [], null, 'newest')).toEqual([
      'GEN/1:4',
    ]);
    expect(getAnnotatedVerseIds([], highlights, 'me', 'newest')).toEqual([
      'GEN/1:1',
    ]);
  });

  it('defines the four named Bible corpus filters', () => {
    expect(isBibleSearchBookFilter('gospels')).toBe(true);
    expect(isBibleSearchBookFilter('GEN')).toBe(false);
    expect(getBibleSearchBookIds('gospels')).toEqual([
      'MAT',
      'MRK',
      'LUK',
      'JHN',
    ]);
    expect(getBibleSearchBookIds('hebrew-bible')).toEqual(
      expect.arrayContaining(['TOB', 'JDT', 'WIS', 'SIR', 'BAR', '1MA']),
    );
    expect(getBibleSearchBookIds('epistles')).not.toContain('REV');
  });

  it('extracts visible verse continuations without notes, headings or attributes', () => {
    const source = String.raw`\id GEN
\c 1
\p
\v 1 In the \w beginning|lemma="hidden"\w* \f + \ft secret note\f*God
created
\q1 the heavens.
\s1 A heading
\p and the earth.
\v 2 Light.`;
    expect(extractVerses(source, 'GEN')).toEqual([
      {
        id: 'GEN/1:1',
        label: '1',
        text: 'In the beginning God created the heavens. and the earth.',
      },
      { id: 'GEN/1:2', label: '2', text: 'Light.' },
    ]);
  });

  it('anchors bridges once and merges consecutive verse parts', () => {
    expect(
      extractVerses('\\c 1\n\\v 1-2 One.\n\\v 3a First\n\\v 3b second.', 'GEN'),
    ).toEqual([
      { id: 'GEN/1:1', label: '1-2', text: 'One.' },
      { id: 'GEN/1:3', label: '3a, 3b', text: 'First second.' },
    ]);
    expect(() => extractVerses('\\c 1\n\\v nonsense Text', 'GEN')).toThrow(
      'Unsupported verse',
    );
  });

  it('ANDs words and consecutive quoted phrases, preserving repetition', () => {
    const tokens = tokenize('Truly, truly I say to you: the light shines.');
    expect(matchesSearch(tokens, parseSearchQuery('light "truly truly"'))).toBe(
      true,
    );
    expect(matchesSearch(tokens, parseSearchQuery('"truly say"'))).toBe(false);
    expect(
      matchesSearch(tokens, parseSearchQuery('"the light" darkness')),
    ).toBe(false);
    expect(matchesSearch(tokens, parseSearchQuery('shine'))).toBe(false);
    expect(matchesSearch(tokens, parseSearchQuery(''))).toBe(false);
    expect(searchRanges(tokens, parseSearchQuery('"truly truly"'))).toEqual([
      [0, 12],
    ]);
  });

  it('normalizes Unicode without stripping accents and rejects incomplete queries', () => {
    expect(
      matchesSearch(tokenize('CAFÉ'), parseSearchQuery('cafe\u0301')),
    ).toBe(true);
    expect(matchesSearch(tokenize('café'), parseSearchQuery('cafe'))).toBe(
      false,
    );
    expect(() => parseSearchQuery('"open')).toThrow('Close the quoted phrase');
    expect(() => parseSearchQuery('x'.repeat(257))).toThrow('256');
  });
});
