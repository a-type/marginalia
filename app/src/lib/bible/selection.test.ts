import { describe, expect, it } from 'vitest';
import {
  normalizeVerseSelection,
  parseVerseSelection,
  resolveVerseSelection,
  selectionBookIds,
  selectionBookRanges,
} from './selection';
import type { TranslationManifest } from './manifests';
import type { VerseId } from './verse';

const availableVerses: VerseId[] = [
  'JHN/3:1',
  'JHN/3:2',
  'JHN/3:4',
  'JHN/3:5',
  'JHN/4:1',
  'JHN/4:2',
  'JHN/4:3',
  'JHN/5:1',
  'JHN/5:2',
];

describe('verse selection search value', () => {
  it('normalizes full IDs and ranges without expanding unbounded input', () => {
    expect(normalizeVerseSelection(' JHN/3:2 - JHN/3:5,JHN/4:1,nope')).toBe(
      'JHN/3:2-JHN/3:5,JHN/4:1',
    );
    expect(
      resolveVerseSelection('JHN/3:1-JHN/3:9007199254740991', availableVerses),
    ).toEqual(availableVerses.slice(0, 4));
  });

  it.each([
    undefined,
    ['JHN/3:1'],
    '',
    '1',
    '1-2',
    '3:1',
    'JHN/3:start-JHN/3:end',
    'JHN/3:1-2',
    'JHN/3:9007199254740992',
  ])('rejects unsupported search value %s', (value) => {
    expect(parseVerseSelection(value)).toEqual([]);
  });

  it('resolves and deduplicates overlapping and cross-chapter ranges', () => {
    expect(
      resolveVerseSelection('JHN/3:4-JHN/5:1,JHN/3:1-JHN/3:4', availableVerses),
    ).toEqual(availableVerses.slice(0, 8));
  });

  it('ignores descending ranges and endpoints in missing chapters', () => {
    expect(
      resolveVerseSelection('JHN/3:5-JHN/3:2,JHN/8:1-JHN/8:2', availableVerses),
    ).toEqual([]);
  });

  it('resolves ranges across books in manifest order', () => {
    const verses: VerseId[] = [
      'GEN/50:25',
      'GEN/50:26',
      'EXO/1:1',
      'EXO/1:2',
      'EXO/2:1',
    ];
    const manifest: TranslationManifest = {
      id: 'test',
      title: 'Test',
      books: [
        { id: 'GEN', title: 'Genesis', chapters: 50 },
        { id: 'EXO', title: 'Exodus', chapters: 40 },
      ],
    };
    const selection = 'EXO/2:1,GEN/50:26-EXO/1:2';
    expect(normalizeVerseSelection(selection)).toBe(selection);
    expect(
      selectionBookIds(selectionBookRanges(selection), 'GEN', manifest),
    ).toEqual(['GEN', 'EXO']);
    expect(resolveVerseSelection(selection, verses)).toEqual(verses.slice(1));
    expect(resolveVerseSelection('EXO/1:1-GEN/50:26', verses)).toEqual([]);
    expect(normalizeVerseSelection('CUSTOM-BOOK/1:1-EXO/1:2')).toBe(
      'CUSTOM-BOOK/1:1-EXO/1:2',
    );
    expect(selectionBookRanges('GEN/50:1,GEN/50:2')).toEqual([
      { start: 'GEN', end: 'GEN' },
    ]);
  });
});
