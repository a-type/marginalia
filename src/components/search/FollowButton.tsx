import { followProfile } from '#/lib/social/functions';
import {
  followedProfilesQueryOptions,
  followSuggestionsQueryOptions,
} from '#/queries/social';
import { Button, type ButtonProps } from '@a-type/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';

export interface FollowButtonProps extends ButtonProps {
  did: string;
}

export function FollowButton({ did, ...props }: FollowButtonProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
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

  return (
    <Button onClick={() => follow.mutateAsync(did)} {...props}>
      Follow
    </Button>
  );
}
