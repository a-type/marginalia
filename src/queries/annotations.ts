import { queryOptions } from '@tanstack/react-query';

import { listChapterAnnotations } from '#/lib/annotations/functions';
import type { BibleLocation } from '#/lib/bible/location';

export const chapterAnnotationsQueryOptions = (location: BibleLocation) =>
  queryOptions({
    queryKey: ['annotations', 'chapter', location.bookId, location.chapter],
    queryFn: () => listChapterAnnotations({ data: location }),
  });
