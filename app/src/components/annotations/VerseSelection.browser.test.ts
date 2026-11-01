import { DbClient, DbProvider } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { normalizeVerseSelection } from '../../lib/bible/selection';
import type * as BibleSource from '../../lib/bible/source';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
} from '../../lib/bible/source';
import type { VerseId } from '../../lib/bible/verse';
import { InterlinearVerse } from '../bible/interlinear/InterlinearVerse';
import { BookIdProvider } from '../usfm/contexts';
import { USFMRenderer } from '../usfm/USFMRenderer';
import {
  annotationPaneActions,
  annotationPaneStore,
} from './annotationPaneState';
import {
  useIsSelectedVerse,
  useToggleVerseSelected,
} from './annotationPaneStore';
import { AnnotationToolbar } from './AnnotationToolbar';
import { VerseSelectionProvider } from './VerseSelection';

vi.mock('../../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationManifest: vi.fn(),
  fetchTranslationSource: vi.fn(),
}));

function VerseButton({ id }: { id: VerseId }) {
  const selected = useIsSelectedVerse(id);
  const toggle = useToggleVerseSelected(id);
  return createElement(
    'button',
    { 'aria-pressed': selected, onClick: toggle },
    id,
  );
}

afterEach(() => {
  annotationPaneActions.reset();
  vi.unstubAllGlobals();
});

async function renderSelection(selection: string, source?: string) {
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const readerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$translation/$book/$chapter',
    validateSearch: (search) => ({
      verses: normalizeVerseSelection(search.verses),
    }),
    loader: () => ({
      location: { bookId: 'JHN', chapter: 3 },
      source:
        source ??
        '\\id JHN\n\\c 3\n\\p\n\\v 1 One\n\\v 2 Two\n\\v 3 Three\n\\c 4\n\\p\n\\v 1 Four\n\\v 2 Five',
    }),
    component: () =>
      createElement(
        VerseSelectionProvider,
        null,
        source
          ? createElement(BookIdProvider, {
              bookId: 'JHN',
              children: createElement(USFMRenderer, { usfm: source }),
            })
          : createElement(
              'div',
              null,
              createElement(VerseButton, { id: 'JHN/3:1' }),
              createElement(VerseButton, { id: 'JHN/3:2' }),
              createElement(VerseButton, { id: 'JHN/3:3' }),
            ),
        createElement(AnnotationToolbar),
      ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([readerRoute]),
    history: createMemoryHistory({
      initialEntries: [
        `/eng_webu/JHN/3?verses=${encodeURIComponent(selection)}`,
      ],
    }),
  });
  await router.load();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          DbProvider,
          { client: dbClient },
          createElement(RouterProvider, { router }),
        ),
      ),
    ),
  );
  return {
    container,
    router,
    async cleanup() {
      root.unmount();
      container.remove();
      queryClient.clear();
      await dbClient.cleanup();
    },
  };
}

describe('URL verse range selection', () => {
  describe('rendered USFM verse boundaries', () => {
    const sources = [
      String.raw`\c 3
\p \v 1 First \wj quoted first.\wj* \v 2 \wj Second.\wj* \v 3 Third.`,
      String.raw`\c 3
\p \v 1 First \wj quoted \+it first. \v 2 Second.\+it* ending\wj* \v 3 Third.`,
      String.raw`\c 3
\p \v 1 First \qt-s |who="speaker"\*quotation\qt-e\* \w word|lemma="word"\w*.
\q1 Continued first.
\q2 \wj More first.\wj*
\b
\p Still first. \v 2 Second. \v 3 Third.
\q2 Continued third.`,
      ...['p', 'q1', 'li1', 'tc1'].map(
        (marker) => String.raw`\c 3
\p \v 1 First.
${'\\'}${marker} Continued first. \v 2 Second. \v 3 Third.
\q2 Continued third.`,
      ),
      String.raw`\c 3
\p \v 1 First.
\p Continued first.
\v 2 Second. \v 3 Third.
\q2 Continued third.`,
    ];

    it.each(sources.map((source, index) => ({ source, index })))(
      'selects only the clicked verse in fixture $index',
      async ({ source }) => {
        const view = await renderSelection('', source);
        try {
          expect(
            view.container.querySelector('[data-verse-id] [data-verse-id]'),
          ).toBeNull();
          for (const number of [1, 2, 3]) {
            const id = `JHN/3:${number}`;
            const fragments = view.container.querySelectorAll<HTMLElement>(
              `[data-verse-id="${id}"]`,
            );
            expect(fragments.length).toBeGreaterThan(0);
            for (const fragment of fragments) {
              (
                fragment.querySelector<HTMLElement>('.usfm-character') ??
                fragment
              ).click();
              await expect
                .poll(() => view.router.state.location.search.verses)
                .toBe(String(number));
              await expect
                .poll(() =>
                  [...view.container.querySelectorAll('[data-selected]')].map(
                    (selected) => selected.getAttribute('data-verse-id'),
                  ),
                )
                .toEqual(Array.from(fragments, () => id));
              expect(
                [...view.container.querySelectorAll('[data-selected]')]
                  .map((selected) => selected.textContent)
                  .join(' '),
              ).not.toContain(
                number === 1 ? 'Second.' : number === 2 ? 'Third.' : 'First.',
              );
              fragment.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
              );
              await expect
                .poll(() => view.router.state.location.search.verses)
                .toBe('');
              await expect
                .poll(
                  () =>
                    view.container.querySelectorAll('[data-selected]').length,
                )
                .toBe(0);
            }
          }
          view.container
            .querySelector<HTMLElement>('[data-verse-id="JHN/3:1"]')!
            .click();
          await expect
            .poll(() => view.router.state.location.search.verses)
            .toBe('1');
          await expect
            .poll(() =>
              view.container
                .querySelector('[data-verse-id="JHN/3:1"]')
                ?.getAttribute('data-selected'),
            )
            .toBe('true');
          view.container
            .querySelector<HTMLButtonElement>('[aria-label="Add annotation"]')!
            .click();
          expect(annotationPaneStore.state.draftVerses).toEqual(['JHN/3:1']);
        } finally {
          await view.cleanup();
        }
      },
    );
  });

  it('opens the interlinear for selected verses and switches word order', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const chapterNumber = Number(
        url.pathname.split('/').at(-1)?.split('.')[0],
      );
      const verses = chapterNumber === 3 ? [2, 3] : [1];
      return new Response(
        JSON.stringify({
          chapter: {
            number: chapterNumber,
            content: verses.map((verse) => ({
              verse,
              words: [
                {
                  pos: 1,
                  bsbPos: 2,
                  language: 'greek',
                  text: 'Ἐν',
                  transliteration: 'En',
                  strongs: 'G1722',
                  gloss: 'In',
                },
                {
                  pos: 2,
                  bsbPos: 1,
                  language: 'greek',
                  text: 'ἀρχῇ',
                  transliteration: 'archē',
                  strongs: 'G0746',
                  gloss: '[the] beginning',
                },
              ],
            })),
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    const view = await renderSelection('3:2-4:1');
    try {
      const trigger = document.body.querySelector<HTMLButtonElement>(
        '[aria-label="Original text"]',
      )!;
      trigger.focus();
      trigger.click();

      await expect
        .poll(() => document.body.querySelectorAll('h3').length)
        .toBe(3);
      expect(
        [...document.body.querySelectorAll('h3')].map(
          (heading) => heading.textContent,
        ),
      ).toEqual(['JHN/3:2', 'JHN/3:3', 'JHN/4:1']);
      expect(fetch).toHaveBeenCalledTimes(2);
      const words = document.body.querySelector('ol')!;
      expect(
        [...words.querySelectorAll('li > span:first-child')].map(
          (word) => word.textContent,
        ),
      ).toEqual(['Ἐν', 'ἀρχῇ']);

      document.body.querySelector<HTMLElement>('[role="switch"]')!.click();
      await expect
        .poll(() =>
          [...words.querySelectorAll('li > span:first-child')].map(
            (word) => word.textContent,
          ),
        )
        .toEqual(['ἀρχῇ', 'Ἐν']);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await expect
        .poll(() => document.body.querySelector('[role="dialog"]'))
        .toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  it('looks up a Strong number in the lexicon', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entry: {
              id: 'G3056',
              senses: [
                {
                  id: 'G3056',
                  lemma: 'λόγος',
                  transliteration: 'logos',
                  partOfSpeech: 'N-M',
                  gloss: 'word',
                  definition: 'λόγος, -ου, ὁ\n\n__1. a word, saying',
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        createElement(
          QueryClientProvider,
          {
            client: new QueryClient({
              defaultOptions: { queries: { retry: false } },
            }),
          },
          createElement(InterlinearVerse, {
            verseId: 'JHN/1:1',
            englishOrder: false,
            verse: {
              verse: 1,
              words: [
                {
                  pos: 1,
                  bsbPos: 1,
                  language: 'greek',
                  text: 'λόγος',
                  transliteration: 'logos',
                  strongs: 'G3056',
                  gloss: 'Word',
                },
              ],
            },
          }),
        ),
      ),
    );
    try {
      expect(fetch).not.toHaveBeenCalled();
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Look up G3056 in the lexicon"]',
        )!
        .click();

      await expect
        .poll(() => document.body.textContent)
        .toContain('a word, saying');
      expect(fetch).toHaveBeenCalledWith(
        'https://bible.helloao.org/api/d/stepbible-lexicon/lexicon/G3056.json',
        expect.any(Object),
      );
      const lemma = [...document.body.querySelectorAll('[lang="el"]')].find(
        (element) => element.closest('[role="dialog"]'),
      );
      expect(lemma?.textContent).toBe('λόγος');
      expect(document.body.textContent).toContain('N-M');
      expect(
        document.body.querySelector(
          'a[href="https://creativecommons.org/licenses/by/4.0/"]',
        ),
      ).not.toBeNull();
    } finally {
      root.unmount();
      container.remove();
    }
  });

  it.each([400, 1000])(
    'opens a nested lexicon dialog with usage popovers without shifting text or navigating at %ipx',
    async (width) => {
      await page.viewport(width, 800);
      vi.mocked(fetchTranslationManifest).mockResolvedValue({
        id: 'eng_webu',
        title: 'World English Bible',
        books: [{ id: 'JHN', title: 'John', chapters: 21, source: 'JHN.usfm' }],
        metadata: {
          language: 'eng',
          languageName: 'English',
          direction: 'ltr',
          licenses: [],
          attribution: 'Public domain',
        },
      });
      vi.mocked(fetchTranslationSource).mockResolvedValue(
        '\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning was the Word.\n\\v 2 He was with God in the beginning.\n\\v 3 All things were made through him.',
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const lexicon = String(input).includes('stepbible-lexicon');
          return Response.json(
            lexicon
              ? {
                  entry: {
                    id: 'G3056',
                    senses: [
                      {
                        id: 'G3056',
                        lemma: 'λόγος',
                        gloss: 'word',
                        definition: '__Word: Jhn.1:1-2, 3; also cited.',
                      },
                    ],
                  },
                }
              : {
                  chapter: {
                    number: 3,
                    content: [
                      {
                        verse: 2,
                        words: [
                          {
                            pos: 1,
                            bsbPos: 1,
                            language: 'greek',
                            text: 'λόγος',
                            transliteration: 'logos',
                            strongs: 'G3056',
                            gloss: 'Word',
                          },
                        ],
                      },
                    ],
                  },
                },
          );
        }),
      );
      const view = await renderSelection('3:2');
      try {
        await expect
          .poll(() =>
            document.body.querySelector('[aria-label="Original text"]'),
          )
          .not.toBeNull();
        document.body
          .querySelector<HTMLButtonElement>('[aria-label="Original text"]')!
          .click();
        await expect
          .poll(() =>
            document.body.querySelector(
              '[aria-label="Look up G3056 in the lexicon"]',
            ),
          )
          .not.toBeNull();
        const trigger = document.body.querySelector<HTMLButtonElement>(
          '[aria-label="Look up G3056 in the lexicon"]',
        )!;
        trigger.click();
        await expect
          .poll(() => document.body.querySelectorAll('[role="dialog"]').length)
          .toBe(2);
        await expect
          .poll(() => document.body.textContent)
          .toContain('John 1:1-2');
        const range = [
          ...document.body.querySelectorAll<HTMLButtonElement>('button'),
        ].find((button) => button.textContent === 'John 1:1-2')!;
        const paragraph = range.closest('p')!;
        expect(
          [...paragraph.querySelectorAll('button')].map(
            (item) => item.textContent,
          ),
        ).toEqual(['John 1:1-2', 'John 1:3']);
        expect(paragraph.textContent).toBe(
          'Word: John 1:1-2, John 1:3; also cited.',
        );
        expect(paragraph.querySelector('ul, li, p')).toBeNull();
        expect(fetchTranslationSource).not.toHaveBeenCalled();
        const second =
          paragraph.querySelectorAll<HTMLButtonElement>('button')[1];
        const secondTop = second.getBoundingClientRect().top;
        expect(secondTop).toBeCloseTo(range.getBoundingClientRect().top, 0);
        expect(second.getBoundingClientRect().left).toBeGreaterThan(
          range.getBoundingClientRect().right,
        );
        await userEvent.click(range);
        await expect
          .poll(() => document.body.textContent)
          .toContain('In the beginning was the Word.');
        expect(document.body.textContent).toContain(
          'He was with God in the beginning.',
        );
        expect(document.body.textContent).not.toContain(
          'All things were made through him.',
        );
        expect(paragraph.textContent).not.toContain(
          'In the beginning was the Word.',
        );
        expect(second.getBoundingClientRect().top).toBeCloseTo(secondTop, 0);
        expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(
          3,
        );
        expect(fetchTranslationManifest).toHaveBeenCalledWith('eng_webu');
        expect(range.getAttribute('aria-expanded')).toBe('true');
        await userEvent.click(range);
        await expect
          .poll(() => range.getAttribute('aria-expanded'))
          .toBe('false');
        await userEvent.click(range);
        await expect
          .poll(() => document.body.textContent)
          .toContain('In the beginning was the Word.');
        await userEvent.keyboard('{Escape}');
        await expect
          .poll(() => range.getAttribute('aria-expanded'))
          .toBe('false');
        await expect
          .poll(() => document.body.querySelectorAll('[role="dialog"]').length)
          .toBe(2);
        await userEvent.click(second);
        await expect
          .poll(() => document.body.textContent)
          .toContain('All things were made through him.');
        expect(fetchTranslationSource).toHaveBeenCalledTimes(1);
        expect(view.router.state.location.pathname).toBe('/eng_webu/JHN/3');
        await userEvent.keyboard('{Escape}');
        await expect
          .poll(() => document.body.querySelectorAll('[role="dialog"]').length)
          .toBe(2);
        await userEvent.keyboard('{Escape}');
        await expect
          .poll(() => document.body.querySelectorAll('[role="dialog"]').length)
          .toBe(1);
        expect(document.body.textContent).toContain(
          'Original-language interlinear',
        );
        trigger.click();
        await expect
          .poll(() => document.body.querySelectorAll('[role="dialog"]').length)
          .toBe(2);
      } finally {
        await view.cleanup();
        await page.viewport(1280, 720);
        vi.mocked(fetchTranslationManifest).mockReset();
        vi.mocked(fetchTranslationSource).mockReset();
      }
    },
  );

  describe('interlinear word rendering', () => {
    it('sets language and direction for Hebrew/Aramaic and Greek words', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      flushSync(() =>
        root.render(
          createElement(
            'div',
            null,
            createElement(InterlinearVerse, {
              verseId: 'GEN/1:1',
              englishOrder: false,
              verse: {
                verse: 1,
                words: [
                  {
                    pos: 1,
                    bsbPos: 1,
                    language: 'hebrew',
                    text: 'בְּרֵאשִׁ֖ית',
                    transliteration: 'bə·rê·šîṯ',
                    strongs: null,
                    gloss: 'In the beginning',
                  },
                ],
              },
            }),
            createElement(InterlinearVerse, {
              verseId: 'DAN/2:4',
              englishOrder: false,
              verse: {
                verse: 4,
                words: [
                  {
                    pos: 1,
                    bsbPos: 1,
                    language: 'aramaic',
                    text: 'מַלְכָּא',
                    transliteration: 'malka',
                    strongs: 'H4430',
                    gloss: 'O king',
                  },
                ],
              },
            }),
            createElement(InterlinearVerse, {
              verseId: 'JHN/1:1',
              englishOrder: false,
              verse: {
                verse: 1,
                words: [
                  {
                    pos: 1,
                    bsbPos: 1,
                    language: 'greek',
                    text: 'Ἐν',
                    transliteration: 'En',
                    strongs: 'G1722',
                    gloss: 'In',
                  },
                ],
              },
            }),
          ),
        ),
      );
      try {
        expect(
          [...container.querySelectorAll('ol')].map((list) => list.dir),
        ).toEqual(['rtl', 'rtl', 'ltr']);
        expect(
          [...container.querySelectorAll('li > span:first-child')].map(
            (word) => [word.getAttribute('lang'), word.getAttribute('dir')],
          ),
        ).toEqual([
          ['he', 'rtl'],
          ['arc', 'rtl'],
          ['el', 'ltr'],
        ]);
        expect(
          container.querySelectorAll(
            '[aria-label="No Strong\'s number available"]',
          ),
        ).toHaveLength(1);
      } finally {
        root.unmount();
        container.remove();
      }
    });
  });

  it('marks the range selected and starts an annotation with every verse', async () => {
    const view = await renderSelection('3:2-4:2');
    try {
      expect(
        [...view.container.querySelectorAll('button[aria-pressed="true"]')].map(
          (button) => button.textContent,
        ),
      ).toEqual(['JHN/3:2', 'JHN/3:3']);
      view.container
        .querySelector<HTMLButtonElement>('[aria-label="Add annotation"]')!
        .click();
      expect(annotationPaneStore.state.draftVerses).toEqual([
        'JHN/3:2',
        'JHN/3:3',
        'JHN/4:1',
        'JHN/4:2',
      ]);
    } finally {
      await view.cleanup();
    }
  });

  it.each(['JHN/3:1', 'JHN/3:2', 'JHN/3:3'] as const)(
    'replaces a range with only the clicked verse %s',
    async (verse) => {
      const view = await renderSelection('2-3');
      try {
        [...view.container.querySelectorAll('button')]
          .find((button) => button.textContent === verse)!
          .click();
        await expect
          .poll(() => view.router.state.location.search)
          .toEqual({
            verses: verse.split(':')[1],
          });
        await expect
          .poll(() =>
            [
              ...view.container.querySelectorAll('button[aria-pressed="true"]'),
            ].map((button) => button.textContent),
          )
          .toEqual([verse]);
      } finally {
        await view.cleanup();
      }
    },
  );
});
