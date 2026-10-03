import { describe, expect, it } from 'vitest';

import { parseUSFM } from './parser';
import { selectChapter } from './select-chapter';

const source = String.raw`\id GEN
\mt1 Book title
\mt2 Book subtitle
\cl Chapter label
\c 1
\p
\v 1 First chapter text.
\c 2
\s Second chapter heading
\p
\v 1 Second chapter text.`;

describe('chapter book headings', () => {
  it('includes the book title and subtitles in the first chapter', () => {
    const chapter = selectChapter(parseUSFM(source), 1);
    const text = JSON.stringify(chapter);
    expect(text).toContain('Book title');
    expect(text).toContain('Book subtitle');
    expect(text).toContain('Chapter label');
    expect(text).not.toContain('Second chapter text');
  });

  it('omits book headings but preserves chapter headings in later chapters', () => {
    const chapter = selectChapter(parseUSFM(source), 2);
    const text = JSON.stringify(chapter);
    expect(text).not.toContain('Book title');
    expect(text).not.toContain('Book subtitle');
    expect(text).not.toContain('Chapter label');
    expect(text).toContain('Second chapter heading');
    expect(text).toContain('Second chapter text');
    expect(text).not.toContain('First chapter text');
  });

  it('preserves the full document when no chapter is selected', () => {
    const document = parseUSFM(source);
    expect(selectChapter(document, undefined)).toBe(document);
  });
});
