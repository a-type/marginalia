import { Box, clsx, Heading } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';

import { m } from '#/paraglide/messages';
import { followSuggestionsQueryOptions } from '#/queries/social';
import { currentUserDidQueryOptions } from '#/queries/user';
import { FollowButton } from '../search/FollowButton';
import cls from './SocialSidebar.module.css';

export interface Person {
  authorDid: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
}

export interface FollowSuggestionsProps {
  className?: string;
}

export function FollowSuggestions({ className }: FollowSuggestionsProps) {
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  const followSuggestions = useQuery({
    ...followSuggestionsQueryOptions,
    enabled: !!accountDid,
  });
  const suggestions = followSuggestions.data ?? [];

  if (suggestions.length === 0) return null;

  return (
    <Box className={clsx(cls.suggestions, className)}>
      <Heading render={<h3 />} emphasis="secondary">
        {m.social_suggestions_title()}
      </Heading>
      {suggestions.map((suggestion) => (
        <PersonRow key={suggestion.authorDid} person={suggestion} />
      ))}
    </Box>
  );
}

export function PersonRow({ person }: { person: Person }) {
  const initials = (person.displayName || person.handle)
    .slice(0, 1)
    .toUpperCase();
  return (
    <div className={cls.person}>
      {person.avatar ? (
        <img className={cls.avatar} src={person.avatar} alt="" />
      ) : (
        <span className={cls.avatarFallback} aria-hidden="true">
          {initials}
        </span>
      )}
      <span className={cls.name}>
        {person.displayName ? <strong>{person.displayName}</strong> : null}
        <small>{person.handle}</small>
      </span>
      <FollowButton did={person.authorDid} emphasis="light">
        {m.fancy_tough_ocelot_charm()}
      </FollowButton>
    </div>
  );
}
