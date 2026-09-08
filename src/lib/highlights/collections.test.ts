import { describe, expect, it } from 'vitest';

import { formatHighlightRkey } from './collections';

describe('formatHighlightRkey', () => {
  it('uses a stable record key for each verse', () => {
    expect(formatHighlightRkey('GEN/1:1')).toBe('highlight-gen-1-1');
    expect(formatHighlightRkey('GEN/1:1')).toBe(formatHighlightRkey('GEN/1:1'));
    expect(formatHighlightRkey('GEN/1:2')).not.toBe(
      formatHighlightRkey('GEN/1:1'),
    );
  });
});
