import { useQueries, useQuery } from '@tanstack/react-query';
import { builtinTranslations } from '../../lib/bible/manifests';
import {
  getTranslationBook,
  hasTranslationChapter,
} from '../../lib/bible/source';
import type { BookId } from '../../lib/bible/verse';
import {
  fetchBibleCatalogQueryOptions,
  readerManifestQueryOptions,
  translationsQueryOptions,
} from '../../queries/translations';

/** Manifests of other same-language translations, loaded only when enabled. */
export function useAlternativeManifests(
  translationId: string,
  language: string | undefined,
  enabled = true,
) {
  const active = enabled && Boolean(language);
  const catalog = useQuery({
    ...fetchBibleCatalogQueryOptions,
    enabled: active,
  });
  const installed = useQuery(translationsQueryOptions);
  const candidates = active
    ? [
        ...new Map(
          [
            ...builtinTranslations.map((entry) => ({
              id: entry.id,
              language: entry.metadata.language,
            })),
            ...(catalog.data ?? []),
            ...(installed.data ?? []).filter(
              (entry) => entry.sourceStatus === 'ready',
            ),
          ].map((entry) => [entry.id, entry]),
        ).values(),
      ].filter(
        (entry) => entry.language === language && entry.id !== translationId,
      )
    : [];
  const manifests = useQueries({
    queries: candidates.map((entry) => ({
      ...readerManifestQueryOptions(entry.id),
      retry: false,
    })),
  });
  return {
    manifests: manifests.flatMap(({ data }) => (data ? [data] : [])),
    loading: active && (catalog.isPending || manifests.some((q) => q.isPending)),
  };
}

/**
 * For each book, finds the translation to use: the current one when it has the
 * book, otherwise the first compatible alternative, otherwise null.
 */
export function useCompatibleTranslations(
  translationId: string,
  bookIds: readonly BookId[],
) {
  const { data: manifest, isPending } = useQuery(
    readerManifestQueryOptions(translationId),
  );
  const missing = manifest
    ? bookIds.filter(
        (bookId) => !hasTranslationChapter(getTranslationBook(manifest, bookId), 1),
      )
    : [];
  const alternatives = useAlternativeManifests(
    translationId,
    manifest?.metadata?.language,
    missing.length > 0,
  );
  const loading = isPending || (missing.length > 0 && alternatives.loading);
  const resolved = new Map<BookId, string | null>();
  for (const bookId of bookIds) {
    if (!missing.includes(bookId)) {
      resolved.set(bookId, translationId);
      continue;
    }
    resolved.set(
      bookId,
      alternatives.manifests.find((entry) =>
        hasTranslationChapter(getTranslationBook(entry, bookId), 1),
      )?.id ?? null,
    );
  }
  return { loading, resolved };
}
