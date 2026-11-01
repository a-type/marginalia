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

import { normalizeVerseSelection } from '../../lib/bible/selection';
import type { VerseId } from '../../lib/bible/verse';
import { InterlinearVerse } from '../bible/interlinear/InterlinearVerse';
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

async function renderSelection(selection: string) {
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
        '\\id JHN\n\\c 3\n\\p\n\\v 1 One\n\\v 2 Two\n\\v 3 Three\n\\c 4\n\\p\n\\v 1 Four\n\\v 2 Five',
    }),
    component: () =>
      createElement(
        VerseSelectionProvider,
        null,
        createElement(VerseButton, { id: 'JHN/3:1' }),
        createElement(VerseButton, { id: 'JHN/3:2' }),
        createElement(VerseButton, { id: 'JHN/3:3' }),
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
