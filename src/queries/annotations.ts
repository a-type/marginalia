import {
  listAnnotationsForVerse,
  listVisibleAnnotations,
} from '#/lib/annotations/indexeddb';
import type { VerseId } from '#/lib/bible/verse';
import { queryOptions } from '@tanstack/react-query';

export function chapterAnnotationsQueryOptions(accountDid: string | null) {
  return queryOptions({
    queryKey: ['annotations', accountDid],
    queryFn: () => listVisibleAnnotations(accountDid),
    enabled: typeof window !== 'undefined',
  });
}

export function verseAnnotationsQueryOptions(
  accountDid: string | null,
  verseId: VerseId | null,
) {
  return queryOptions({
    queryKey: ['annotations', accountDid, verseId],
    queryFn: () =>
      verseId
        ? listAnnotationsForVerse(verseId, accountDid)
        : Promise.resolve([]),
    enabled: !!verseId && typeof window !== 'undefined',
  });
}
