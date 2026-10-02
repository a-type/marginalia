import { queryOptions } from '@tanstack/react-query';

import type { BibleLocation } from '#/lib/bible/location';
import { listChapterHighlights } from '#/lib/highlights/functions';

export const chapterHighlightsQueryOptions = (location: BibleLocation) =>
  queryOptions({
    queryKey: ['highlights', 'chapter', location.bookId, location.chapter],
    queryFn: () => listChapterHighlights({ data: location }),
  });
