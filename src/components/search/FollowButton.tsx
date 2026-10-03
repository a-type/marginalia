import { followProfile } from '#/lib/social/functions';
import { followSuggestionsQueryOptions } from '#/queries/social';
import { Button, type ButtonProps } from '@a-type/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { Person } from '../auth/SocialSidebar';

export interface FollowButtonProps extends ButtonProps {
  did: string;
}

export function FollowButton({ did, ...props }: FollowButtonProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const follow = useMutation({
    mutationFn: (subject: string) => followProfile({ data: { subject } }),
    onSuccess: async (_, subject) => {
      queryClient.setQueryData<Person[]>(
        followSuggestionsQueryOptions.queryKey,
        (suggestions = []) =>
          suggestions.filter((suggestion) => suggestion.authorDid !== subject),
      );
      await router.invalidate();
    },
  });

  return (
    <Button onClick={() => follow.mutateAsync(did)} {...props}>
      Follow
    </Button>
  );
}
