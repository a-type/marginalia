import { logoutFn } from '#/lib/auth/functions';
import { m } from '#/paraglide/messages';
import {
  currentActorProfileQueryOptions,
  currentProfileQueryOptions,
} from '#/queries/social';
import { currentUserDidQueryOptions } from '#/queries/user';
import { Avatar, Button, DropdownMenu } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { LoginDialog } from './LoginDialog';
import { ProfileDialog } from './ProfileDialog';

export interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const userDid = userDidQuery.data ?? null;
  const actorProfileQuery = useQuery({
    ...currentActorProfileQueryOptions(userDid),
    enabled: typeof window !== 'undefined' && Boolean(userDid),
  });
  const actorProfile = actorProfileQuery.data;
  const profileQuery = useQuery({
    ...currentProfileQueryOptions,
    enabled: typeof window !== 'undefined' && Boolean(userDid),
  });
  const profile = profileQuery.data;
  const logout = useServerFn(logoutFn);

  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={<Button emphasis="ghost" size="small" />}
          aria-label="User menu"
          className={className}
        >
          <Button.Icon
            render={
              <Avatar
                name={
                  profile?.displayName ??
                  actorProfile?.displayName ??
                  actorProfile?.handle ??
                  userDid ??
                  undefined
                }
                imageSrc={profile?.avatar ?? actorProfile?.avatar}
                size="16px"
              />
            }
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {userDid ? (
            <>
              <DropdownMenu.Item onClick={() => setShowProfile(true)}>
                {m.profile_setup_title()}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="@mode-attention"
                onClick={() => void logout()}
              >
                {m.equal_zany_marlin_feel()}
              </DropdownMenu.Item>
            </>
          ) : (
            <DropdownMenu.Item
              className="@mode-attention"
              onClick={() => setShowLogin(true)}
            >
              {m.legal_cool_snail_taste()}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>
      <LoginDialog open={showLogin} setOpen={setShowLogin} />
      <ProfileDialog
        accountDid={userDid}
        open={showProfile}
        setOpen={setShowProfile}
      />
    </>
  );
}
