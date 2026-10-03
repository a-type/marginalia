import {
  Button,
  Dialog,
  FormikForm,
  Heading,
  TextAreaField,
  TextField,
} from '@a-type/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { followProfile, saveProfile } from '#/lib/social/functions';
import { m } from '#/paraglide/messages';
import {
  currentProfileQueryOptions,
  followedProfilesQueryOptions,
  followSuggestionsQueryOptions,
  profileSetupQueryOptions,
} from '#/queries/social';

export interface ProfileDialogProps {
  open: boolean;
  setOpen: (value: boolean) => void;
}

interface ProfileValues {
  handle: string;
  displayName: string;
  avatar: string;
  description: string;
}

export function ProfileDialog({ open, setOpen }: ProfileDialogProps) {
  const queryClient = useQueryClient();
  const profileSetup = useQuery({
    ...profileSetupQueryOptions(),
    enabled: typeof window !== 'undefined' && open,
  });
  const followSuggestions = useQuery({
    ...followSuggestionsQueryOptions,
    enabled: open,
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
      ]);
    },
  });
  const initialValues = profileSetup.data?.seed ?? null;
  const suggestions = followSuggestions.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Content>
        <Dialog.Title>{m.profile_setup_title()}</Dialog.Title>
        {open && profileSetup.isPending ? (
          <p>{m.profile_setup_loading()}</p>
        ) : null}
        {profileSetup.isError ? (
          <p role="alert">{m.profile_setup_error()}</p>
        ) : null}
        {initialValues ? (
          <FormikForm<ProfileValues>
            initialValues={initialValues}
            onSubmit={async (values) => {
              await saveProfile({ data: values });
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: currentProfileQueryOptions.queryKey,
                }),
                queryClient.invalidateQueries({
                  queryKey: profileSetupQueryOptions().queryKey,
                }),
              ]);
              setOpen(false);
            }}
          >
            <TextField
              required
              name="handle"
              label={m.profile_handle_label()}
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
            />
            <TextField
              name="displayName"
              label={m.profile_display_name_label()}
            />
            <TextField
              name="avatar"
              label={m.profile_avatar_label()}
              type="url"
              autoCapitalize="none"
              autoComplete="url"
              spellCheck={false}
            />
            <TextAreaField
              name="description"
              label={m.profile_description_label()}
              autoSize={false}
              rows={4}
            />
            <FormikForm.Error />
            <FormikForm.SubmitButton>
              {m.profile_save()}
            </FormikForm.SubmitButton>
          </FormikForm>
        ) : null}
        {suggestions.length > 0 ? (
          <section>
            <Heading render={<h3 />} emphasis="secondary">
              {m.social_suggestions_title()}
            </Heading>
            {suggestions.map((suggestion) => (
              <div key={suggestion.authorDid}>
                <span>{suggestion.displayName || suggestion.handle}</span>
                <Button
                  type="button"
                  size="small"
                  disabled={follow.isPending}
                  onClick={() => follow.mutate(suggestion.authorDid)}
                >
                  {m.social_follow()}
                </Button>
              </div>
            ))}
          </section>
        ) : null}
      </Dialog.Content>
    </Dialog>
  );
}
