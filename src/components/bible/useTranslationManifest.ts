import { fetchTranslationManifest } from '#/lib/bible/source';
import { queryOptions, useQuery } from '@tanstack/react-query';

export const translationManifestQueryOptions = (translationId: string) =>
  queryOptions({
    queryKey: ['translations', translationId, 'manifest'],
    queryFn: () => fetchTranslationManifest(translationId),
    networkMode: 'always',
  });

export function useTranslationManifest(translationId: string) {
  return useQuery(translationManifestQueryOptions(translationId));
}
