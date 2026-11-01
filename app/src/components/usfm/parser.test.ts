import { describe, expect, it } from 'vitest';

import { parseUSFM } from './parser';

describe('USFM paragraph semantics', () => {
  it('separates verse boundaries inside nested character marks', () => {
    const document = parseUSFM(
      String.raw`\p \v 1 Before \wj quoted \+it first \v 2 second\+it* ending\wj* after \v 3 Last.`,
    );

    expect(document.children).toMatchObject([
      {
        marker: 'p',
        children: [
          {
            marker: 'v',
            argument: '1',
            children: [
              { type: 'text', value: 'Before ' },
              {
                marker: 'wj',
                children: [
                  { type: 'text', value: 'quoted ' },
                  { marker: 'it', children: [{ value: 'first ' }] },
                ],
              },
            ],
          },
          {
            marker: 'v',
            argument: '2',
            children: [
              {
                marker: 'wj',
                children: [
                  { marker: 'it', children: [{ value: 'second' }] },
                  { value: ' ending' },
                ],
              },
              { value: ' after ' },
            ],
          },
          { marker: 'v', argument: '3', children: [{ value: 'Last.' }] },
        ],
      },
    ]);
  });

  it.each(['p', 'q1', 'li1', 'tc1'])(
    'retains a continuation prefix before a new verse in %s',
    (marker) => {
      const document = parseUSFM(
        String.raw`\c 1
\p \v 1 First.
${'\\'}${marker} Continued. \v 2 Second. \v 3 Third.
\q2 Third continues.`,
      );
      expect(document.children).toMatchObject([
        {
          marker: 'c',
          children: [
            { marker: 'p' },
            {
              marker,
              continuationVerseArgument: '1',
              children: [
                { value: 'Continued. ' },
                { marker: 'v', argument: '2' },
                { marker: 'v', argument: '3' },
              ],
            },
            { marker: 'q2', continuationVerseArgument: '3' },
          ],
        },
      ]);
    },
  );

  it('retains continuation text before a verse on a separate physical line', () => {
    const document = parseUSFM(String.raw`\c 1
\p \v 1 First.
\p Continued.
\v 2 Second. \v 3 Third.
\q1 Third continues.`);
    expect(document.children).toMatchObject([
      {
        children: [
          { marker: 'p' },
          {
            marker: 'p',
            continuationVerseArgument: '1',
            children: [
              { value: 'Continued.' },
              { marker: 'v', argument: '2' },
              { marker: 'v', argument: '3' },
            ],
          },
          { marker: 'q1', continuationVerseArgument: '3' },
        ],
      },
    ]);
  });

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

  it('keeps verses active across continuation blocks', () => {
    const document = parseUSFM(String.raw`\c 4
\p \v 18 These are the generations of Perez:
\b
\li1 Perez was the father of Hezron,
\li1 \v 19 Hezron was the father of Ram,
\li1 Ram was the father of Amminadab,
\p A following paragraph continues verse 19.
\q1 A poetry line continues verse 19.
\tr \v 20 A table row starts verse 20.
\tc1 A table cell continues verse 20.`);

    expect(document.children).toMatchObject([
      {
        marker: 'c',
        children: [
          { marker: 'p', children: [{ marker: 'v', argument: '18' }] },
          { marker: 'b' },
          {
            marker: 'li1',
            category: 'list',
            continuationVerseArgument: '18',
          },
          {
            marker: 'li1',
            category: 'list',
            children: [{ marker: 'v', argument: '19' }],
          },
          {
            marker: 'li1',
            category: 'list',
            continuationVerseArgument: '19',
          },
          {
            marker: 'p',
            category: 'paragraph',
            continuationVerseArgument: '19',
          },
          {
            marker: 'q1',
            category: 'poetry',
            continuationVerseArgument: '19',
          },
          {
            marker: 'tr',
            category: 'table',
            children: [{ marker: 'v', argument: '20' }],
          },
          {
            marker: 'tc1',
            category: 'table',
            continuationVerseArgument: '20',
          },
        ],
      },
    ]);
  });

  it('continues the last inline verse into a quoted paragraph', () => {
    const document = parseUSFM(String.raw`\c 7
\p \v 41 Verse 41. \v 42 Verse 42 ends with a colon:
\b
\q1 Quoted text continues verse 42.
\q2 The quotation continues.
\q1 \v 43 Verse 43 begins.
\q2 This line continues verse 43.`);

    expect(document.children).toMatchObject([
      {
        marker: 'c',
        children: [
          {
            marker: 'p',
            children: [
              {
                marker: 'v',
                argument: '41',
                children: [{ type: 'text', value: 'Verse 41. ' }],
              },
              {
                marker: 'v',
                argument: '42',
                children: [
                  { type: 'text', value: 'Verse 42 ends with a colon:' },
                ],
              },
            ],
          },
          { marker: 'b' },
          { marker: 'q1', continuationVerseArgument: '42' },
          { marker: 'q2', continuationVerseArgument: '42' },
          {
            marker: 'q1',
            children: [{ marker: 'v', argument: '43' }],
          },
          { marker: 'q2', continuationVerseArgument: '43' },
        ],
      },
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
            children: [
              { marker: 'v', argument: '3' },
              { marker: 'v', argument: '4' },
            ],
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

describe('USFM physical line wrapping', () => {
  it('keeps Revelation 1:19 text with its verse number', () => {
    const source = String.raw`\p \v 19
\wj Therefore\f + \fr 1:19 \ft TR does not include \fqa Therefore\ft .\f* write down the things you have seen, the things that are, and the things that will happen after this. \wj* \v 20 \wj This is the mystery of the seven stars.\wj*`;
    const document = parseUSFM(source);

    expect(document).toEqual(parseUSFM(source.replaceAll('\n', ' ')));
    expect(document.children).toMatchObject([
      {
        marker: 'p',
        children: [
          {
            marker: 'v',
            argument: '19',
            children: [
              {
                marker: 'wj',
                category: 'character',
                closed: true,
                children: [
                  { type: 'text', value: 'Therefore' },
                  { marker: 'f', category: 'note', closed: true },
                  {
                    type: 'text',
                    value:
                      ' write down the things you have seen, the things that are, and the things that will happen after this. ',
                  },
                ],
              },
              { type: 'text', value: ' ' },
            ],
          },
          {
            marker: 'v',
            argument: '20',
            children: [{ marker: 'wj', closed: true }],
          },
        ],
      },
    ]);
  });

  it.each([
    String.raw`\p \v 19 \wj Write down
the things that will happen after this.\wj*`,
    String.raw`\p \v 19 \wj Write down the things that will happen after this.
\wj*`,
    String.raw`\p \v 19 \wj Write down
\+w the|strong="G3588"\+w* things that will happen after this.\wj*`,
  ])('ignores physical line breaks within inline content', (source) => {
    expect(parseUSFM(source)).toEqual(parseUSFM(source.replaceAll('\n', ' ')));
  });
});
