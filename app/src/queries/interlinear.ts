import { queryOptions } from '@tanstack/react-query';
import { fetchInterlinearChapter } from '../lib/bible/interlinear';

export const interlinearChapterQueryOptions = (book: string, chapter: number) =>
  queryOptions({
    queryKey: ['interlinear', 'bsb', book, chapter],
    queryFn: ({ signal }) => fetchInterlinearChapter(book, chapter, signal),
    networkMode: 'offlineFirst',
    staleTime: 365 * 24 * 60 * 60 * 1000,
    gcTime: 365 * 24 * 60 * 60 * 1000,
    retry: 1,
  });
