import {
  currentActorProfileQueryOptions,
  currentProfileQueryOptions,
} from '#/queries/social';
import { Avatar } from '@a-type/ui';
import type { AvatarProps } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';

export interface UserAvatarProps extends AvatarProps {}

export function UserAvatar(props: UserAvatarProps) {
  const actorProfileQuery = useQuery({
    ...currentActorProfileQueryOptions(),
    enabled: typeof window !== 'undefined',
  });
  const actorProfile = actorProfileQuery.data;
  const profileQuery = useQuery({
    ...currentProfileQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const profile = profileQuery.data;
  return (
    <Avatar
      {...props}
      name={
        profile?.displayName ??
        actorProfile?.displayName ??
        actorProfile?.handle ??
        undefined
      }
      imageSrc={profile?.avatar ?? actorProfile?.avatar}
      size="16px"
    />
  );
}
