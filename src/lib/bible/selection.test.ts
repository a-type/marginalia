import { describe, expect, it } from 'vitest';

import { formatVerseSelection, parseVerseSelection } from './selection';

describe('verse selection search value', () => {
  it('normalizes positive verse numbers', () => {
    expect(parseVerseSelection('7,2,2,nope,0')).toEqual([2, 7]);
    expect(formatVerseSelection([7, 2, 2])).toBe('2,7');
  });

  it('rejects unsupported search values', () => {
    expect(parseVerseSelection(['1', '2'])).toEqual([]);
    expect(parseVerseSelection(undefined)).toEqual([]);
  });
});
