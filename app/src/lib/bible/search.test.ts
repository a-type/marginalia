import { describe, expect, it } from 'vitest';
import {
  extractVerses,
  matchesSearch,
  parseSearchQuery,
  searchRanges,
  tokenize,
} from './search';

describe('Bible search', () => {
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
