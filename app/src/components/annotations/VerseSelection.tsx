import { getRouteApi } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { createContext, use } from 'react';

import { extractVerses } from '../../lib/bible/search';
import { resolveVerseSelection } from '../../lib/bible/selection';
import type { VerseId } from '../../lib/bible/verse';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const VerseSelectionContext = createContext<readonly VerseId[]>([]);

export function VerseSelectionProvider({
  children,
  selectionOverride,
}: {
  children: ReactNode;
  selectionOverride?: string | null;
}) {
  const { sources } = readerRoute.useLoaderData();
  const routeSelection = readerRoute.useSearch({
    select: (search) => search.verses,
  });
  const selection =
    selectionOverride === undefined
      ? routeSelection
      : (selectionOverride ?? undefined);
  const availableVerses = selection
    ? sources.flatMap((entry) =>
        extractVerses(entry.source, entry.bookId).map((verse) => verse.id),
      )
    : [];
  const verses = resolveVerseSelection(selection, availableVerses);
  return (
    <VerseSelectionContext value={verses}>{children}</VerseSelectionContext>
  );
}

export function useSelectedVerseIds() {
  return use(VerseSelectionContext);
}
