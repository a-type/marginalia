import { DbClient, DbProvider } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type * as AuthFunctions from '../../lib/auth/functions';
import { getAnnotationCollections } from '../../lib/annotations/collections';
import {
  importTranslation,
  removeTranslation,
} from '../../lib/bible/translation-jobs';
import { getHighlightCollections } from '../../lib/highlights/collections';
import { BibleSearch } from './BibleSearch';

vi.mock('../../lib/auth/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthFunctions>()),
  getCurrentUserDid: vi.fn().mockResolvedValue('did:plc:owner'),
}));

it('shows one-line previews of the current user’s notes on matching verses', async () => {
  const translationId = `local-${crypto.randomUUID()}`;
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const container = document.createElement('div');
  container.style.width = '320px';
  document.body.append(container);
  const root = createRoot(container);
  const notes = getAnnotationCollections(dbClient).annotations;
  const highlights = getHighlightCollections(dbClient).highlights;
  const noteIds = Array.from(
    { length: 3 },
    () => `local:${crypto.randomUUID()}`,
  );
  const highlightId = `local:${crypto.randomUUID()}`;
  const longComment = `A long note ${'with many words '.repeat(30)}\nand a second line`;
  try {
    await importTranslation(
      new File(
        [
          '\\id GEN\n\\c 1\n\\v 1 First verse.\n\\v 2 Second verse.\n\\v 3 Third verse.',
        ],
        'Bible.usfm',
      ),
      'Preview test',
      translationId,
    );
    for (const [index, note] of [
      {
        authorDid: 'did:plc:owner',
        verses: ['GEN/1:1', 'GEN/1:2'] as const,
        comment: longComment,
      },
      {
        authorDid: null,
        verses: ['GEN/1:1'] as const,
        comment: 'Another local note',
      },
      {
        authorDid: 'did:plc:other',
        verses: ['GEN/1:1', 'GEN/1:3'] as const,
        comment: 'Someone else’s note',
      },
    ].entries()) {
      await notes.insert({
        id: noteIds[index],
        rkey: noteIds[index],
        uri: null,
        cid: null,
        authorDid: note.authorDid,
        bookId: 'GEN',
        chapter: 1,
        chapterKeys: ['GEN/1'],
        verses: [...note.verses],
        comment: note.comment,
        createdAt: '2020-01-01T00:00:00Z',
        status: 'pending',
        syncError: null,
      }).isPersisted.promise;
    }
    await highlights.insert({
      id: highlightId,
      rkey: highlightId,
      uri: null,
      cid: null,
      authorDid: 'did:plc:owner',
      bookId: 'GEN',
      chapter: 1,
      verse: 3,
      verseId: 'GEN/1:3',
      color: 'lemon',
      createdAt: '2021-01-01T00:00:00Z',
      status: 'pending',
      syncError: null,
    }).isPersisted.promise;

    const route = createRootRoute({
      component: () =>
        createElement(BibleSearch, {
          initialTranslation: translationId,
          isActive: true,
        }),
    });
    const router = createRouter({
      routeTree: route,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    await router.load();
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

    await vi.waitFor(() => expect(container.textContent).toContain('My notes'));
    const notesButton = page.getByRole('button', { name: 'My notes' });
    await userEvent.click(notesButton);
    await expect.element(page.getByText('2 matching verses')).toBeVisible();
    const resultFor = (reference: string) =>
      Array.from(container.querySelectorAll('ol li')).find((result) =>
        result.textContent?.includes(reference),
      );
    const first = resultFor('GEN 1:1');
    const second = resultFor('GEN 1:2');
    expect(first?.querySelectorAll('[data-surface]')).toHaveLength(2);
    expect(second?.querySelectorAll('[data-surface]')).toHaveLength(1);
    expect(first?.textContent).toContain('Another local note');
    expect(second?.textContent).toContain(longComment);
    expect(container.textContent).not.toContain('Someone else’s note');
    const snippet = second?.querySelector('[data-surface] > span');
    expect(snippet?.textContent).toBe(longComment);
    expect(snippet && getComputedStyle(snippet).whiteSpace).toBe('nowrap');
    expect(snippet && getComputedStyle(snippet).textOverflow).toBe('ellipsis');
    expect(snippet && snippet.scrollWidth > snippet.clientWidth).toBe(true);

    await notes.update(noteIds[0], (draft) => {
      draft.comment = 'Updated note';
    }).isPersisted.promise;
    await vi.waitFor(() => {
      expect(resultFor('GEN 1:1')?.textContent).toContain('Updated note');
      expect(resultFor('GEN 1:2')?.textContent).toContain('Updated note');
    });
    await userEvent.click(page.getByRole('button', { name: 'My highlights' }));
    await expect.element(page.getByText('3 matching verses')).toBeVisible();
    expect(resultFor('GEN 1:3')?.querySelector('[data-surface]')).toBeNull();
    await userEvent.click(notesButton);
    await expect.element(page.getByText('1 matching verses')).toBeVisible();
    expect(container.querySelector('ol [data-surface]')).toBeNull();
  } finally {
    flushSync(() => root.unmount());
    container.remove();
    await vi.waitFor(() => {
      expect(notes.subscriberCount).toBe(0);
      expect(highlights.subscriberCount).toBe(0);
    });
    for (const id of noteIds) {
      if (notes.has(id)) await notes.delete(id).isPersisted.promise;
    }
    if (highlights.has(highlightId))
      await highlights.delete(highlightId).isPersisted.promise;
    queryClient.clear();
    await dbClient.cleanup();
    await removeTranslation(translationId);
  }
});

it('browses locally persisted notes and highlights together and filters search', async () => {
  const translationId = `local-${crypto.randomUUID()}`;
  const noteId = `local:${crypto.randomUUID()}`;
  const highlightId = `local:${crypto.randomUUID()}`;
  const originalClient = new DbClient();
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement('div');
  container.style.width = '320px';
  document.body.append(container);
  const root = createRoot(container);
  try {
    await importTranslation(
      new File(
        [
          '\\id GEN\n\\c 1\n\\v 1 First light.\n\\v 2 Second verse.\n\\v 3 Other light.',
        ],
        'Bible.usfm',
      ),
      'Search test',
      translationId,
    );
    const notes = getAnnotationCollections(originalClient).annotations;
    await notes.insert({
      id: noteId,
      rkey: noteId,
      uri: null,
      cid: null,
      authorDid: 'did:plc:owner',
      bookId: 'GEN',
      chapter: 1,
      chapterKeys: ['GEN/1'],
      verses: ['GEN/1:1', 'GEN/1:2'],
      comment: 'Note',
      createdAt: '2020-01-01T00:00:00Z',
      status: 'pending',
      syncError: null,
    }).isPersisted.promise;
    const highlights = getHighlightCollections(originalClient).highlights;
    await highlights.preload();
    await highlights.insert({
      id: highlightId,
      rkey: highlightId,
      uri: null,
      cid: null,
      authorDid: 'did:plc:owner',
      bookId: 'GEN',
      chapter: 1,
      verse: 3,
      verseId: 'GEN/1:3',
      color: 'lemon',
      createdAt: '2021-01-01T00:00:00Z',
      status: 'pending',
      syncError: null,
    }).isPersisted.promise;

    function SearchHarness() {
      const [isActive, setIsActive] = useState(true);
      return createElement(
        'div',
        null,
        createElement(
          'button',
          { onClick: () => setIsActive(!isActive) },
          isActive ? 'Pause search' : 'Resume search',
        ),
        createElement(BibleSearch, {
          initialTranslation: translationId,
          isActive,
        }),
      );
    }
    const route = createRootRoute({ component: SearchHarness });
    const router = createRouter({
      routeTree: route,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    await router.load();
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

    await vi.waitFor(() => expect(container.textContent).toContain('My notes'));
    const notesButton = page.getByRole('button', { name: 'My notes' });
    const highlightsButton = page.getByRole('button', {
      name: 'My highlights',
    });
    await expect.element(notesButton).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(notesButton);
    await expect.element(notesButton).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByText('2 matching verses')).toBeVisible();
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    await userEvent.click(
      page.getByRole('combobox', { name: 'Filter results by book' }),
    );
    await userEvent.click(page.getByRole('option', { name: 'New Testament' }));
    await expect.element(page.getByText('No matching verses')).toBeVisible();
    await userEvent.click(
      page.getByRole('combobox', { name: 'Filter results by book' }),
    );
    await userEvent.click(page.getByRole('option', { name: 'All books' }));
    await expect.element(page.getByText('2 matching verses')).toBeVisible();
    const liveNotes = getAnnotationCollections(dbClient).annotations;
    await liveNotes.update(noteId, (draft) => {
      draft.verses = ['GEN/1:1'];
    }).isPersisted.promise;
    await expect.element(page.getByText('1 matching verses')).toBeVisible();
    await liveNotes.update(noteId, (draft) => {
      draft.verses = ['GEN/1:1', 'GEN/1:2'];
    }).isPersisted.promise;
    await expect.element(page.getByText('2 matching verses')).toBeVisible();
    await userEvent.click(highlightsButton);
    await expect
      .element(highlightsButton)
      .toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByText('3 matching verses')).toBeVisible();
    expect(container.querySelector('ol li')?.textContent).toContain('GEN 1:3');
    await userEvent.click(notesButton);
    await expect.element(notesButton).toHaveAttribute('aria-pressed', 'false');
    await expect.element(page.getByText('1 matching verses')).toBeVisible();
    expect(container.querySelector('ol li')?.textContent).toContain('GEN 1:3');
    await userEvent.click(notesButton);
    await expect.element(page.getByText('3 matching verses')).toBeVisible();
    const filterBar = container.querySelector(
      '[role="group"][aria-label="Search filters"]',
    );
    const controls = filterBar?.querySelectorAll('button');
    expect(controls).toHaveLength(5);
    const positions = Array.from(
      controls ?? [],
      (control) => control.getBoundingClientRect().top,
    );
    expect(new Set(positions).size).toBeLessThan(controls?.length ?? 0);
    await userEvent.click(
      page.getByRole('combobox', { name: 'Annotation order' }),
    );
    await userEvent.click(page.getByRole('option', { name: 'Oldest first' }));
    await expect
      .poll(() => container.querySelector('ol li')?.textContent)
      .toContain('GEN 1:1');
    await userEvent.fill(
      page.getByRole('textbox', { name: 'Words or quoted phrase' }),
      'light',
    );
    await expect.element(page.getByText('2 matching verses')).toBeVisible();
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    await userEvent.click(page.getByRole('button', { name: 'Pause search' }));
    await userEvent.click(page.getByRole('button', { name: 'Resume search' }));
    await expect.element(notesButton).toHaveAttribute('aria-pressed', 'false');
    await expect
      .element(highlightsButton)
      .toHaveAttribute('aria-pressed', 'false');
    await expect
      .element(page.getByRole('textbox', { name: 'Words or quoted phrase' }))
      .toHaveValue('');
    await expect
      .element(page.getByRole('combobox', { name: 'Annotation order' }))
      .not.toBeInTheDocument();
  } finally {
    flushSync(() => root.unmount());
    container.remove();
    await vi.waitFor(() => {
      expect(
        getAnnotationCollections(dbClient).annotations.subscriberCount,
      ).toBe(0);
      expect(getHighlightCollections(dbClient).highlights.subscriberCount).toBe(
        0,
      );
    });
    const notes = getAnnotationCollections(originalClient).annotations;
    if (notes.has(noteId)) await notes.delete(noteId).isPersisted.promise;
    const highlights = getHighlightCollections(originalClient).highlights;
    if (highlights.has(highlightId))
      await highlights.delete(highlightId).isPersisted.promise;
    queryClient.clear();
    await Promise.all([originalClient.cleanup(), dbClient.cleanup()]);
    await removeTranslation(translationId);
  }
});
