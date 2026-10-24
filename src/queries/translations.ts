import {
  searchTranslation,
  startTranslationService,
} from '#/lib/bible/translation-jobs';
import {
  listTranslations,
  subscribeTranslations,
} from '#/lib/bible/translations';
import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';

export const translationsQueryOptions = queryOptions({
  queryKey: ['translations'],
  queryFn: () =>
    typeof window === 'undefined' ? Promise.resolve([]) : listTranslations(),
  networkMode: 'always',
  staleTime: 0,
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
  });
  window.addEventListener('focus', () => {
    void client.invalidateQueries({ queryKey: ['translations'] });
  });
  startTranslationService();
}
