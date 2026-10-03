import {
  Box,
  Button,
  Divider,
  FormikForm,
  Heading,
  TextField,
} from '@a-type/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { followProfile, lookupProfileByHandle } from '#/lib/social/functions';
import { m } from '#/paraglide/messages';
import { followSuggestionsQueryOptions } from '#/queries/social';
import cls from './SocialSidebar.module.css';

interface Person {
  authorDid: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
}

export interface SocialSidebarProps {
  accountDid: string | null;
}

export function SocialSidebar({ accountDid }: SocialSidebarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [followedDids, setFollowedDids] = useState<Set<string>>(new Set());
  const followSuggestions = useQuery({
    ...followSuggestionsQueryOptions,
    enabled: !!accountDid,
  });
  const lookup = useMutation({
    mutationFn: (handle: string) => lookupProfileByHandle({ data: { handle } }),
  });
  const follow = useMutation({
    mutationFn: (subject: string) => followProfile({ data: { subject } }),
    onSuccess: async (_, subject) => {
      setFollowedDids((current) => new Set(current).add(subject));
      queryClient.setQueryData<Person[]>(
        followSuggestionsQueryOptions.queryKey,
        (suggestions = []) =>
          suggestions.filter((suggestion) => suggestion.authorDid !== subject),
      );
      await router.invalidate();
    },
  });
  const lookupResult = lookup.data ?? null;
  const suggestions = followSuggestions.data ?? [];

  if (!accountDid) return null;

  return (
    <Box className={cls.root} col gap>
      <Heading render={<h2 />} emphasis="secondary">
        {m.social_people_title()}
      </Heading>
      <FormikForm
        className={cls.form}
        initialValues={{ handle: '' }}
        onSubmit={async ({ handle }) => {
          await lookup.mutateAsync(handle);
        }}
      >
        <TextField
          required
          name="handle"
          label={m.social_lookup_label()}
          autoCapitalize="none"
          autoComplete="off"
          placeholder="alice.bsky.social"
          spellCheck={false}
        />
        <FormikForm.Error />
        <FormikForm.SubmitButton>
          {m.social_lookup_submit()}
        </FormikForm.SubmitButton>
      </FormikForm>
      {lookupResult ? (
        <Box className={cls.result}>
          <PersonRow
            person={{
              authorDid: lookupResult.did,
              handle: lookupResult.handle,
              displayName: lookupResult.displayName ?? null,
              avatar: lookupResult.avatar ?? null,
            }}
            followed={followedDids.has(lookupResult.did)}
            onFollow={follow.mutateAsync}
          />
        </Box>
      ) : null}
      {suggestions.length > 0 ? (
        <>
          <Divider />
          <Box className={cls.suggestions}>
            <Heading render={<h3 />} emphasis="secondary">
              {m.social_suggestions_title()}
            </Heading>
            {suggestions.map((suggestion) => (
              <PersonRow
                key={suggestion.authorDid}
                person={suggestion}
                followed={followedDids.has(suggestion.authorDid)}
                onFollow={follow.mutateAsync}
              />
            ))}
          </Box>
        </>
      ) : null}
    </Box>
  );
}

function PersonRow({
  person,
  followed,
  onFollow,
}: {
  person: Person;
  followed: boolean;
  onFollow: (did: string) => Promise<unknown>;
}) {
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
      <Button
        type="button"
        size="small"
        disabled={followed}
        onClick={() => void onFollow(person.authorDid)}
      >
        {followed ? m.social_following() : m.social_follow()}
      </Button>
    </div>
  );
}
