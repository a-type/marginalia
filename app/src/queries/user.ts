import { queryOptions } from '@tanstack/react-query';
import { getCurrentUserDid } from '../lib/auth/functions';

export const currentUserDidQueryOptions = queryOptions({
  queryKey: ['user', 'did'],
  queryFn: getCurrentUserDid,
});
