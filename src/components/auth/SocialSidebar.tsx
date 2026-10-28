import { Box, FormikForm, Heading, TextField } from '@a-type/ui';
import { useMutation } from '@tanstack/react-query';

import {
  FollowSuggestions,
  PersonRow,
} from '#/components/auth/FollowSuggestions';
import { lookupProfileByHandle } from '#/lib/social/functions';
import { m } from '#/paraglide/messages';
import cls from './SocialSidebar.module.css';

export interface SocialSidebarProps {
  accountDid: string | null;
}

export function SocialSidebar({ accountDid }: SocialSidebarProps) {
  const lookup = useMutation({
    mutationFn: (handle: string) => lookupProfileByHandle({ data: { handle } }),
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
