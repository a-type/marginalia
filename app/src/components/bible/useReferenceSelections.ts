import { useQueries } from '@tanstack/react-query';
import {
  referenceNeedsVerses,
  referenceVerseSelection,
  type BibleReference,
} from '../../lib/bible/location';
import { translationBookVersesQueryOptions } from '../../queries/translations';

export function useReferenceSelections(
  translation: string,
  references: readonly BibleReference[],
) {
  const books = [
    ...new Set(
      references.filter(referenceNeedsVerses).map(({ bookId }) => bookId),
    ),
  ];
  const queries = useQueries({
    queries: books.map((bookId) =>
      translationBookVersesQueryOptions(translation, bookId),
    ),
  });
  return references.map((reference) => {
    const needsVerses = referenceNeedsVerses(reference);
    const query = needsVerses
      ? queries[books.indexOf(reference.bookId)]
      : undefined;
    const loading = !!query?.isPending;
    const verses = referenceVerseSelection(
      reference,
      query?.data?.available ? query.data.verses.map(({ id }) => id) : [],
    );
    return {
      verses,
      loading,
      unavailable: !loading && !verses,
      retry: query?.isError ? query.refetch : undefined,
    };
  });
}
