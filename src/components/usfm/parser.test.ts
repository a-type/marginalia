import { describe, expect, it } from 'vitest';

import { parseUSFM } from './parser';

describe('USFM paragraph semantics', () => {
  it('keeps list headers and footers separate from list entries', () => {
    const document = parseUSFM(String.raw`\lh Introduction
\li1 First item
\li2 Nested item
\lim1 Embedded item
\lf Conclusion`);

    expect(document.children).toMatchObject([
      { marker: 'lh', category: 'paragraph' },
      { marker: 'li1', category: 'list' },
      { marker: 'li2', category: 'list' },
      { marker: 'lim1', category: 'list' },
      { marker: 'lf', category: 'paragraph' },
    ]);
  });

  it('treats the Genesis creation narrative as paragraphs, not list entries', () => {
    const document = parseUSFM(String.raw`\c 1
\s2 The First Day
\lf \v 3 And God said, "Let there be light," and there was light. \v 4 And God saw that the light was good.
\lf And there was evening, and there was morning - the first day.
\s2 The Second Day
\lf \v 6 And God said, "Let there be an expanse."`);

    expect(document.children).toMatchObject([
      {
        marker: 'c',
        children: [
          { marker: 's2', category: 'heading' },
          {
            marker: 'lf',
            category: 'paragraph',
            children: [{ marker: 'v', argument: '3' }],
          },
          { marker: 'lf', category: 'paragraph' },
          { marker: 's2', category: 'heading' },
          {
            marker: 'lf',
            category: 'paragraph',
            children: [{ marker: 'v', argument: '6' }],
          },
        ],
      },
    ]);
  });

  it('preserves section reference labels as a paragraph below the heading', () => {
    const document = parseUSFM(String.raw`\s1 The Creation
\r (\ref John 1:1-5|JHN 1:1-5\ref*; \ref Hebrews 11:1-3|HEB 11:1-3\ref*)
\p \v 1 In the beginning God created the heavens and the earth.`);

    expect(document.children).toMatchObject([
      { marker: 's1', category: 'heading' },
      {
        marker: 'r',
        category: 'paragraph',
        children: [
          { type: 'text', value: '(' },
          {
            marker: 'ref',
            category: 'character',
            closed: true,
            attributes: { loc: 'JHN 1:1-5' },
            children: [{ type: 'text', value: 'John 1:1-5' }],
          },
          { type: 'text', value: '; ' },
          {
            marker: 'ref',
            category: 'character',
            closed: true,
            attributes: { loc: 'HEB 11:1-3' },
            children: [{ type: 'text', value: 'Hebrews 11:1-3' }],
          },
          { type: 'text', value: ')' },
        ],
      },
      { marker: 'p', category: 'paragraph' },
    ]);
  });

  it('supports references with an explicit location attribute', () => {
    const document = parseUSFM(
      String.raw`\r \ref John 1:1-5|loc="JHN 1:1-5"\ref*`,
    );

    expect(document.children).toMatchObject([
      {
        children: [
          {
            marker: 'ref',
            attributes: { loc: 'JHN 1:1-5' },
            children: [{ type: 'text', value: 'John 1:1-5' }],
          },
        ],
      },
    ]);
  });
});