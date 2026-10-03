import { Box, FormikForm, Heading, TextField } from '@a-type/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';

import {
  FollowSuggestions,
  PersonRow,
} from '#/components/auth/FollowSuggestions';
import { followProfile, lookupProfileByHandle } from '#/lib/social/functions';
import { m } from '#/paraglide/messages';
import {
  followedProfilesQueryOptions,
  followSuggestionsQueryOptions,
} from '#/queries/social';
import cls from './SocialSidebar.module.css';

export interface SocialSidebarProps {
  accountDid: string | null;
}

export function SocialSidebar({ accountDid }: SocialSidebarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const followedProfiles = useQuery({
    ...followedProfilesQueryOptions,
    enabled: !!accountDid,
  });
  const followedDids = new Set(
    followedProfiles.data?.map((profile) => profile.authorDid) ?? [],
  );
  const lookup = useMutation({
    mutationFn: (handle: string) => lookupProfileByHandle({ data: { handle } }),
  });
  const follow = useMutation({
    mutationFn: (subject: string) => followProfile({ data: { subject } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: followSuggestionsQueryOptions.queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: followedProfilesQueryOptions.queryKey,
        }),
        router.invalidate(),
      ]);
    },
  });
  const lookupResult = lookup.data ?? null;

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
          />
        </Box>
      ) : null}
      <FollowSuggestions />
    </Box>
  );
}
