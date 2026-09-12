import { queryOptions } from '@tanstack/react-query';

import {
  getCurrentProfileFn,
  getProfileSetupFn,
  listFollowSuggestionsFn,
} from '#/lib/social/functions';

export const profileSetupQueryOptions = queryOptions({
  queryKey: ['social', 'profile-setup'],
  queryFn: getProfileSetupFn,
});

export const followSuggestionsQueryOptions = queryOptions({
  queryKey: ['social', 'follow-suggestions'],
  queryFn: listFollowSuggestionsFn,
});

export const currentProfileQueryOptions = queryOptions({
  queryKey: ['social', 'current-profile'],
  queryFn: getCurrentProfileFn,
});
