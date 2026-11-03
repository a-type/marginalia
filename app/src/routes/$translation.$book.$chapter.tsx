import { createFileRoute, notFound } from '@tanstack/react-router';

import { AppShell } from '../components/app/AppShell';
import { BibleReader } from '../components/bible/BibleReader';
import { BibleRecovery } from '../components/bible/BibleRecovery';
import { parseBibleLocation } from '../lib/bible/location';
import {
  normalizeVerseSelection,
  selectionBookIds,
  selectionBookRanges,
} from '../lib/bible/selection';
import {
  getTranslationBook,
  hasTranslationChapter,
  isTranslationId,
} from '../lib/bible/source';
import {
  readerBookSourceQueryOptions,
  readerManifestQueryOptions,
} from '../queries/translations';

export const Route = createFileRoute('/$translation/$book/$chapter')({
  ssr: ({ params }) =>
    params.status !== 'success' ||
    !params.value.translation.startsWith('local-'),
  errorComponent: BibleRecovery,
  notFoundComponent: BibleRecovery,
  validateSearch: (search: Record<string, unknown>) => {
    const verses = normalizeVerseSelection(search.verses);
    const annotation =
      typeof search.annotation === 'string' && search.annotation
        ? search.annotation
        : undefined;
    return {
      ...(verses ? { verses } : {}),
      ...(verses && annotation ? { annotation } : {}),
    };
  },
  loaderDeps: ({ search }) => ({
    bookRanges: selectionBookRanges(search.verses),
  }),
  loader: async ({ params, deps, context }) => {
    const location = parseBibleLocation(params.book, params.chapter);
    if (!location || !isTranslationId(params.translation)) throw notFound();

    const manifest = await context.queryClient.fetchQuery(
      readerManifestQueryOptions(params.translation),
    );
    const book = getTranslationBook(manifest, location.bookId);
    if (!hasTranslationChapter(book, location.chapter)) throw notFound();

    const books = selectionBookIds(deps.bookRanges, location.bookId, manifest);
    const sources = await Promise.all(
      books.map(async (bookId) => {
        const selectedBook = getTranslationBook(manifest, bookId);
        if (!selectedBook) throw notFound();
        return {
          bookId,
          source: await context.queryClient.fetchQuery(
            readerBookSourceQueryOptions(params.translation, selectedBook),
          ),
        };
      }),
    );
    return {
      location,
      manifest,
      sources,
      translationId: params.translation,
    };
  },
  component: ReaderPage,
});

function ReaderPage() {
  return (
    <AppShell>
      <BibleReader />
    </AppShell>
  );
}
