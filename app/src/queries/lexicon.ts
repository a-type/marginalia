import { queryOptions } from '@tanstack/react-query';
import { fetchLexiconEntry, normalizeStrongsId } from '../lib/bible/lexicon';

export const lexiconEntryQueryOptions = (strongsId: string) =>
  queryOptions({
    queryKey: [
      'lexicon',
      'stepbible',
      normalizeStrongsId(strongsId) ?? strongsId,
    ],
    queryFn: ({ signal }) => fetchLexiconEntry(strongsId, signal),
    networkMode: 'offlineFirst',
    staleTime: 365 * 24 * 60 * 60 * 1000,
    gcTime: 365 * 24 * 60 * 60 * 1000,
    retry: 1,
  });
