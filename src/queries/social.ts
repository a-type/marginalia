import { queryOptions } from '@tanstack/react-query';

import {
  getCurrentBlueskyProfile,
  getCurrentProfile,
  getProfileSetup,
  listFollowSuggestions,
} from '#/lib/social/functions';

export const profileSetupQueryOptions = () =>
  queryOptions({
    queryKey: ['social', 'profile-setup'],
    queryFn: getProfileSetup,
  });

export const followSuggestionsQueryOptions = queryOptions({
  queryKey: ['social', 'follow-suggestions'],
  queryFn: listFollowSuggestions,
});

export const currentProfileQueryOptions = queryOptions({
  queryKey: ['social', 'current-profile'],
  queryFn: getCurrentProfile,
});

export const currentActorProfileQueryOptions = () =>
  queryOptions({
    queryKey: ['social', 'actor-profile'],
    queryFn: getCurrentBlueskyProfile,
  });
