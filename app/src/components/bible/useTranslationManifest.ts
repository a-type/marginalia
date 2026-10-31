import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchTranslationManifest } from '../../lib/bible/source';

export const translationManifestQueryOptions = (translationId: string) =>
  queryOptions({
    queryKey: ['translations', translationId, 'manifest'],
    queryFn: () => fetchTranslationManifest(translationId),
    networkMode: 'always',
  });

export function useTranslationManifest(translationId: string) {
  return useQuery(translationManifestQueryOptions(translationId));
}
