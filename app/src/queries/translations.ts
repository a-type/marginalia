import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { fetchBibleCatalog } from '../lib/bible/fetch-bible';
import { extractVerses } from '../lib/bible/search';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
  getTranslationBook,
  type TranslationBook,
} from '../lib/bible/source';
import {
  searchTranslation,
  startTranslationService,
} from '../lib/bible/translation-jobs';
import {
  listTranslations,
  subscribeTranslations,
} from '../lib/bible/translations';

export const fetchBibleCatalogQueryOptions = queryOptions({
  queryKey: ['fetch-bible-catalog'],
  queryFn: ({ signal }) => fetchBibleCatalog(signal),
  staleTime: 60 * 60 * 1000,
});

export const translationsQueryOptions = queryOptions({
  queryKey: ['translations'],
  queryFn: () =>
    typeof window === 'undefined' ? Promise.resolve([]) : listTranslations(),
  networkMode: 'always',
  staleTime: 0,
});

export const readerManifestQueryOptions = (translationId: string) =>
  queryOptions({
    queryKey: ['reader-manifest', translationId],
    queryFn: () => fetchTranslationManifest(translationId),
    networkMode: 'offlineFirst',
    staleTime: 60 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

export const readerBookSourceQueryOptions = (
  translationId: string,
  book: TranslationBook,
) =>
  queryOptions({
    queryKey: ['reader-book-source', translationId, book.id],
    queryFn: () => fetchTranslationSource(translationId, book),
    networkMode: 'offlineFirst',
    staleTime: 60 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

export const translationBookVersesQueryOptions = (
  translationId: string,
  bookId: string,
) =>
  queryOptions({
    queryKey: ['translation-book-verses', translationId, bookId],
    queryFn: async () => {
      const manifest = await fetchTranslationManifest(translationId);
      const book = getTranslationBook(manifest, bookId);
      if (!book) return { available: false as const };
      const source = await fetchTranslationSource(translationId, book);
      return {
        available: true as const,
        title: manifest.title,
        language: manifest.metadata?.language,
        verses: extractVerses(source, bookId),
      };
    },
    networkMode: 'offlineFirst',
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

export const bibleSearchQueryOptions = (
  translationId: string,
  query: string,
  page: number,
  bookId?: string,
) =>
  queryOptions({
    queryKey: ['bible-search', translationId, query, bookId, page],
    queryFn: ({ signal }) =>
      searchTranslation(translationId, query, page, signal, bookId),
    networkMode: 'always',
    retry: false,
    gcTime: 0,
  });

const clients = new WeakSet<QueryClient>();
export function initializeTranslations(client: QueryClient) {
  if (typeof window === 'undefined' || clients.has(client)) return;
  clients.add(client);
  subscribeTranslations(() => {
    void client.invalidateQueries({ queryKey: ['translations'] });
    void client.invalidateQueries({ queryKey: ['bible-search'] });
    void client.invalidateQueries({ queryKey: ['translation-book-verses'] });
    void client.invalidateQueries({ queryKey: ['reader-manifest'] });
    void client.invalidateQueries({ queryKey: ['reader-book-source'] });
  });
  window.addEventListener('focus', () => {
    void client.invalidateQueries({ queryKey: ['translations'] });
  });
  startTranslationService();
}
