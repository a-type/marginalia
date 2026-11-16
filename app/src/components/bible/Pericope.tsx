import { getRouteApi } from '@tanstack/react-router';
import { createContext, use, type ReactNode } from 'react';

import { extractVerses } from '../../lib/bible/search';
import { resolveVerseSelection } from '../../lib/bible/selection';
import type { VerseId } from '../../lib/bible/verse';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const PericopeContext = createContext<readonly VerseId[]>([]);

export function PericopeProvider({
  pericope,
  children,
}: {
  pericope: string | undefined;
  children: ReactNode;
}) {
  const { sources } = readerRoute.useLoaderData();
  const availableVerses = pericope
    ? sources.flatMap((entry) =>
        extractVerses(entry.source, entry.bookId).map((verse) => verse.id),
      )
    : [];
  const verses = resolveVerseSelection(pericope, availableVerses);
  return <PericopeContext value={verses}>{children}</PericopeContext>;
}

export function usePericopeVerseIds() {
  return use(PericopeContext);
}
