import { queryOptions } from '@tanstack/react-query';
import { fetchLectionaryReadings } from '../lib/lectionary';

export const lectionaryReadingsQueryOptions = (
  date: string,
  tradition: string,
) =>
  queryOptions({
    queryKey: ['lectserve', 'sections', date, tradition],
    queryFn: ({ signal }) => fetchLectionaryReadings(date, tradition, signal),
    staleTime: 60 * 60 * 1000,
  });
