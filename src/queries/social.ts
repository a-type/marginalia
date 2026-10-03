import { queryOptions } from '@tanstack/react-query';

import {
  getCurrentBlueskyProfile,
  getCurrentProfile,
  getProfileSetup,
  listFollowedProfiles,
  listFollowSuggestions,
  searchBlueskyActors,
  type SearchBlueskyActorsInput,
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

export const followedProfilesQueryOptions = queryOptions({
  queryKey: ['social', 'followed-profiles'],
  queryFn: listFollowedProfiles,
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

export const blueskyActorSearchQueryOptions = (
  input: SearchBlueskyActorsInput,
) =>
  queryOptions({
    queryKey: ['social', 'bluesky-actor-search', input.prefix],
    queryFn: () => searchBlueskyActors({ data: input }),
    enabled: input.prefix.length > 3,
  });
