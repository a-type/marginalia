import { describe, expect, it } from 'vitest';

import {
  formatVerseSelection,
  normalizeVerseSelection,
  parseVerseSelection,
  resolveVerseSelection,
} from './selection';
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
  it('normalizes ranges without expanding unbounded user input', () => {
    expect(normalizeVerseSelection(' 2 - 5,4:start-5:end,nope,0')).toBe(
      '2-5,4:start-5:end',
    );
    expect(formatVerseSelection([7, 2, 2])).toBe('2,7');
    expect(
      resolveVerseSelection('1-9007199254740991', 3, availableVerses),
    ).toEqual(availableVerses.slice(0, 4));
  });

  it.each([undefined, ['1', '2'], '', '0,-1,1.5,1e2,1-2-3,9007199254740992'])(
    'rejects unsupported search value %s',
    (value) => expect(parseVerseSelection(value)).toEqual([]),
  );

  it('resolves local ranges, deduplicates overlaps, and keeps the first verse primary', () => {
    expect(resolveVerseSelection('4-5,1-4,2', 3, availableVerses)).toEqual(
      availableVerses.slice(0, 4),
    );
  });

  it('resolves cross-chapter ranges using the actual verses in the translation', () => {
    expect(resolveVerseSelection('3:4-5:1', 3, availableVerses)).toEqual(
      availableVerses.slice(2, 8),
    );
    expect(resolveVerseSelection('4-4:2', 3, availableVerses)).toEqual(
      availableVerses.slice(2, 6),
    );
  });

  it('assumes the current chapter for every unqualified endpoint', () => {
    expect(resolveVerseSelection('4:1-2', 3, availableVerses)).toEqual([]);
    expect(resolveVerseSelection('4:1-4:2,5', 3, availableVerses)).toEqual([
      'JHN/3:5',
      'JHN/4:1',
      'JHN/4:2',
    ]);
  });

  it('resolves start and end within the specified or current chapter', () => {
    expect(resolveVerseSelection('start-end', 4, availableVerses)).toEqual(
      availableVerses.slice(4, 7),
    );
    expect(resolveVerseSelection('3:end-5:start', 3, availableVerses)).toEqual(
      availableVerses.slice(3, 8),
    );
    expect(resolveVerseSelection('end', 3, availableVerses)).toEqual([
      'JHN/3:5',
    ]);
  });

  it('ignores descending ranges and endpoints in missing chapters', () => {
    expect(
      resolveVerseSelection('5-2,4:2-3:1,8:start-8:end', 3, availableVerses),
    ).toEqual([]);
  });
});
