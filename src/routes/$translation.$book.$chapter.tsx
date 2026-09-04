import { createFileRoute, notFound } from '@tanstack/react-router';

import { BibleReader } from '#/components/bible/BibleReader';
import { parseBibleLocation } from '#/lib/bible/location';
import {
  formatVerseSelection,
  parseVerseSelection,
} from '#/lib/bible/selection';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
  getTranslationBook,
  hasTranslationChapter,
  isTranslationId,
} from '#/lib/bible/source';
import { userAccountQueryOptions } from '#/queries/user';

export const Route = createFileRoute('/$translation/$book/$chapter')({
  validateSearch: (search: Record<string, unknown>) => {
    const verse = parseVerseSelection(search.verses).at(0);
    const verses = verse ? formatVerseSelection([verse]) : undefined;
    const annotation =
      typeof search.annotation === 'string' && search.annotation
        ? search.annotation
        : undefined;
    return {
      ...(verses ? { verses } : {}),
      ...(annotation ? { annotation } : {}),
    };
  },
  loader: async ({ params, context }) => {
    const location = parseBibleLocation(params.book, params.chapter);
    if (!location || !isTranslationId(params.translation)) throw notFound();

    const manifest = await fetchTranslationManifest(params.translation);
    const book = getTranslationBook(manifest, location.bookId);
    if (!hasTranslationChapter(book, location.chapter)) throw notFound();

    const source = await fetchTranslationSource(params.translation, book);

    await context.queryClient.query({
      ...userAccountQueryOptions,
      staleTime: 'static',
    });

    return {
      location,
      manifest,
      source,
      translationId: params.translation,
    };
  },
  component: BibleReader,
});
