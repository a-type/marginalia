import { getRouteApi } from '@tanstack/react-router';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';

import { extractVerses } from '#/lib/bible/search';
import { resolveVerseSelection } from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const VerseSelectionContext = createContext<readonly VerseId[]>([]);

export function VerseSelectionProvider({ children }: { children: ReactNode }) {
  const { location, source } = readerRoute.useLoaderData();
  const selection = readerRoute.useSearch({
    select: (search) => search.verses,
  });
  const availableVerses = selection
    ? extractVerses(source, location.bookId).map((verse) => verse.id)
    : [];
  const verses = resolveVerseSelection(
    selection,
    location.chapter,
    availableVerses,
  );
  return (
    <VerseSelectionContext value={verses}>{children}</VerseSelectionContext>
  );
}

export function useSelectedVerseIds() {
  return use(VerseSelectionContext);
}
