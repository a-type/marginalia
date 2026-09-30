import { queryOptions, skipToken } from '@tanstack/react-query';

import {
  getCurrentBlueskyProfileFn,
  getCurrentProfileFn,
  getProfileSetupFn,
  listFollowSuggestionsFn,
} from '#/lib/social/functions';

export const profileSetupQueryOptions = (did: string | null) =>
  queryOptions({
    queryKey: ['social', 'profile-setup', did],
    queryFn: did ? () => getProfileSetupFn(did) : skipToken,
  });

export const followSuggestionsQueryOptions = queryOptions({
  queryKey: ['social', 'follow-suggestions'],
  queryFn: listFollowSuggestionsFn,
});

export const currentProfileQueryOptions = queryOptions({
  queryKey: ['social', 'current-profile'],
  queryFn: getCurrentProfileFn,
});

export const currentActorProfileQueryOptions = (did: string | null) =>
  queryOptions({
    queryKey: ['social', 'actor-profile', did],
    queryFn: getCurrentBlueskyProfileFn,
  });
