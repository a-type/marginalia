import { getCurrentAccountFn } from '#/lib/auth/functions';
import { queryOptions } from '@tanstack/react-query';

export const userAccountQueryOptions = queryOptions({
  queryKey: ['user', 'account'],
  queryFn: getCurrentAccountFn,
});
