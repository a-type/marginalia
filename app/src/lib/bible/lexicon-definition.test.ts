import { describe, expect, it } from 'vitest';
import { parseLexiconDefinition } from './lexicon-definition';

function references(definition: string) {
  return parseLexiconDefinition(definition).flatMap(({ parts }) =>
    parts.flatMap((part) =>
      part.type === 'reference' ? [part.reference] : [],
    ),
  );
}

describe('lexicon usage citations', () => {
  it('expands inherited verses and chapters while preserving text flow', () => {
    const result = parseLexiconDefinition(
      '__1. a word: Mat.8:8, Luk.7:7, 1Co.14:9, 19 Heb.12:19, al.',
    );
    expect(result[0].indented).toBe(true);
    expect(result[0].parts).toMatchObject([
      { type: 'text', text: '1. a word: ' },
      { type: 'reference', reference: { label: 'Matthew 8:8' } },
      { type: 'text', text: ', ' },
      { type: 'reference', reference: { label: 'Luke 7:7' } },
      { type: 'text', text: ', ' },
      { type: 'reference', reference: { label: '1 Corinthians 14:9' } },
      { type: 'text', text: ', ' },
      { type: 'reference', reference: { label: '1 Corinthians 14:19' } },
      { type: 'text', text: ' ' },
      { type: 'reference', reference: { label: 'Hebrews 12:19' } },
      { type: 'text', text: ', al.' },
    ]);
    expect(references('Jhn.5:24 8:52, 53').map(({ label }) => label)).toEqual([
      'John 5:24',
      'John 8:52',
      'John 8:53',
    ]);
  });

  it('handles ranges, bracketed verses, and single-chapter books', () => {
    expect(
      references('Mat.13:20-23, Mrk.16:[20], 2Jn.5-6, Ju 6').map(
        ({ passage }) => [passage.bookId, passage.chapter, passage.verseLabel],
      ),
    ).toEqual([
      ['MAT', 13, '20-23'],
      ['MRK', 16, '20'],
      ['2JN', 1, '5-6'],
      ['JUD', 1, '6'],
    ]);
  });

  it('recognizes Roman prefixes without mistaking Isaiah for a numbered book', () => {
    expect(
      references('Isa.1:1, I Jhn.1:10, IIIJhn.10, 1 Co 15:29').map(
        ({ passage }) => passage.bookId,
      ),
    ).toEqual(['ISA', '1JN', '3JN', '1CO']);
  });

  it('retains the epistle context for abbreviated Jn continuations', () => {
    expect(
      references('1Jn.1:1 Jn 2:13-14 Jn 2:24').map(({ label }) => label),
    ).toEqual(['1 John 1:1', '1 John 2:13-14', '1 John 2:24']);
  });

  it('preserves prose and qualifiers without guessing parenthetical numbers', () => {
    const definition =
      'of God: Rev.21:6 (cf. 18); similarly, Rev.22:13; Unknown.1:2; WM 37, 4.';
    const result = parseLexiconDefinition(definition);
    expect(references(definition).map(({ label }) => label)).toEqual([
      'Revelation 21:6',
      'Revelation 22:13',
    ]);
    expect(result[0].parts).toContainEqual({
      type: 'text',
      text: ' (cf. 18); similarly, ',
    });
    expect(result[0].parts.at(-1)).toEqual({
      type: 'text',
      text: '; Unknown.1:2; WM 37, 4.',
    });
    expect(parseLexiconDefinition('1) to be\n\n1a) to become')).toEqual([
      { indented: false, parts: [{ type: 'text', text: '1) to be' }] },
      { indented: false, parts: [{ type: 'text', text: '1a) to become' }] },
    ]);
  });

  it('does not truncate malformed citations or reinterpret prose as a verse', () => {
    expect(
      references('Jhn.1:1, 2o, Unknown.1:1; Mat.0:1; H3068; Col.2:23'),
    ).toHaveLength(2);
    expect(
      references('Field, Notes, 193 f.; Mat.5:37 (WM 60, 3)'),
    ).toHaveLength(1);
  });
});
