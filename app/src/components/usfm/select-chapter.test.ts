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

describe('poetry verse continuations', () => {
  it('associates continuation lines with the active verse', () => {
    const document = parseUSFM(String.raw`\c 1
\q1
\v 1 First line.
\q2 Second line.
\q1
\v 2 New verse.
\q2 Continuation of verse two.`);
    const chapter = document.children[0];

    if (chapter.type !== 'marker') throw new Error('Expected chapter node');

    const poetryArguments = chapter.children.flatMap((node) =>
      node.type === 'marker' && node.category === 'poetry'
        ? [node.continuationVerseArgument]
        : [],
    );

    expect(poetryArguments).toEqual([undefined, '1', undefined, '2']);
  });

  it('associates poetry lines after an inline verse marker with that verse', () => {
    const document = parseUSFM(String.raw`\c 1
\q1 \v 9 Our Father.
\q2 Who art in heaven.
\q1 \v 10 Thy kingdom come.
\q2 On earth as it is in heaven.`);
    const chapter = document.children[0];

    if (chapter.type !== 'marker') throw new Error('Expected chapter node');

    const poetryArguments = chapter.children.flatMap((node) =>
      node.type === 'marker' && node.category === 'poetry'
        ? [node.continuationVerseArgument]
        : [],
    );

    expect(poetryArguments).toEqual([undefined, '9', undefined, '10']);
  });
});
