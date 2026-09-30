import { queryOptions } from '@tanstack/react-query';

import { listChapterHighlightsFn } from '#/lib/highlights/functions';
import type { BibleLocation } from '#/lib/bible/location';

export const chapterHighlightsQueryOptions = (
  accountDid: string | null,
  location: BibleLocation,
) =>
  queryOptions({
    queryKey: [
      'highlights',
      'chapter',
      accountDid,
      location.bookId,
      location.chapter,
    ],
    queryFn: () => listChapterHighlightsFn({ data: location }),
  });
