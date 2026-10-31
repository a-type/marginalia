import { m } from '#/paraglide/messages';
import { Button, clsx, DropdownMenu } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { logout } from '../../lib/auth/functions';
import { currentUserDidQueryOptions } from '../../queries/user';
import { SettingsDialog } from '../settings/SettingsDialog';
import { UpdatePrompt } from '../updates/UpdatePrompt';
import { useIsUpdateAvailable } from '../updates/updateState';
import { LoginDialog } from './LoginDialog';
import { ProfileDialog } from './ProfileDialog';
import { UserAvatar } from './UserAvatar';
import cls from './UserMenu.module.css';

export interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const userDid = userDidQuery.data ?? null;
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const updateAvailable = useIsUpdateAvailable();

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              emphasis={updateAvailable ? 'light' : 'ghost'}
              size="small"
              forceIconMode
              className={cls.trigger}
            />
          }
          aria-label="User menu"
          className={className}
        >
          <Button.Icon render={<UserAvatar size="16px" />} />
          {updateAvailable && (
            <div className={clsx(cls.updateIndicator, '@mode-attention')} />
          )}
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
          <DropdownMenu.Item onClick={() => setShowSettings(true)}>
            {m.elegant_watery_oryx_radiate()}
          </DropdownMenu.Item>
          <UpdatePrompt />
        </DropdownMenu.Content>
      </DropdownMenu>
      <LoginDialog open={showLogin} setOpen={setShowLogin} />
      <ProfileDialog open={showProfile} setOpen={setShowProfile} />
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
