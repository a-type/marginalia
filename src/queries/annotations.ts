import { queryOptions } from '@tanstack/react-query';

import { listChapterAnnotationsFn } from '#/lib/annotations/functions';
import type { BibleLocation } from '#/lib/bible/location';

export const chapterAnnotationsQueryOptions = (
  accountDid: string | null,
  location: BibleLocation,
) =>
  queryOptions({
    queryKey: [
      'annotations',
      'chapter',
      accountDid,
      location.bookId,
      location.chapter,
    ],
    queryFn: () => listChapterAnnotationsFn({ data: location }),
  });
