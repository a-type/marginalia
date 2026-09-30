import { getCurrentUserDidFn } from '#/lib/auth/functions';
import { queryOptions } from '@tanstack/react-query';

export const currentUserDidQueryOptions = queryOptions({
  queryKey: ['user', 'did'],
  queryFn: getCurrentUserDidFn,
});
