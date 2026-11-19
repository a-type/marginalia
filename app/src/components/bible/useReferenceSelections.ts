import { useQueries } from '@tanstack/react-query';
import {
  referenceNeedsVerses,
  referenceVerseSelection,
  type BibleReference,
} from '../../lib/bible/location';
import { translationBookVersesQueryOptions } from '../../queries/translations';

export function useReferenceSelections(
  translation: string | ((reference: BibleReference) => string | null),
  references: readonly BibleReference[],
) {
  const translationFor = (reference: BibleReference) =>
    typeof translation === 'function' ? translation(reference) : translation;
  const keys = [
    ...new Map(
      references.flatMap((reference) => {
        const id = translationFor(reference);
        return referenceNeedsVerses(reference) && id
          ? [[`${id}:${reference.bookId}`, { id, bookId: reference.bookId }]]
          : [];
      }),
    ).entries(),
  ];
  const queries = useQueries({
    queries: keys.map(([, { id, bookId }]) =>
      translationBookVersesQueryOptions(id, bookId),
    ),
  });
  return references.map((reference) => {
    const needsVerses = referenceNeedsVerses(reference);
    const id = translationFor(reference);
    const query =
      needsVerses && id
        ? queries[keys.findIndex(([key]) => key === `${id}:${reference.bookId}`)]
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
