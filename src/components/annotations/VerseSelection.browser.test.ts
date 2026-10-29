import { DbClient, DbProvider } from '@tanstack/react-db';
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
import { afterEach, describe, expect, it } from 'vitest';

import { normalizeVerseSelection } from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';
import { AnnotationToolbar } from './AnnotationToolbar';
import {
  annotationPaneActions,
  annotationPaneStore,
} from './annotationPaneState';
import {
  useIsSelectedVerse,
  useToggleVerseSelected,
} from './annotationPaneStore';
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

afterEach(() => annotationPaneActions.reset());

async function renderSelection(selection: string) {
  const dbClient = new DbClient();
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
        DbProvider,
        { client: dbClient },
        createElement(RouterProvider, { router }),
      ),
    ),
  );
  return {
    container,
    router,
    async cleanup() {
      root.unmount();
      container.remove();
      await dbClient.cleanup();
    },
  };
}

describe('URL verse range selection', () => {
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
