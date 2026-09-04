import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { requestAnnotationSync } from '#/lib/annotations/sync';
import type { BibleLocation } from '#/lib/bible/location';
import { parseVerseId } from '#/lib/bible/verse';
import { chapterAnnotationsQueryOptions } from '#/queries/annotations';

export function useChapterAnnotations(
  accountDid: string | null,
  location: BibleLocation,
) {
  const queryClient = useQueryClient();
  const annotations = useQuery(chapterAnnotationsQueryOptions(accountDid));

  useEffect(() => {
    if (!accountDid) return;
    const synchronize = () => {
      void requestAnnotationSync(accountDid).finally(() =>
        queryClient.invalidateQueries({ queryKey: ['annotations'] }),
      );
    };
    synchronize();
    window.addEventListener('online', synchronize);
    return () => window.removeEventListener('online', synchronize);
  }, [accountDid, queryClient]);

  return (annotations.data ?? []).filter((annotation) => {
    const firstVerse = parseVerseId(annotation.verses[0]);
    return (
      firstVerse.bookId === location.bookId &&
      firstVerse.chapter === location.chapter
    );
  });
}
