import { logoutFn } from '#/lib/auth/functions';
import { m } from '#/paraglide/messages';
import { userAccountQueryOptions } from '#/queries/user';
import { Avatar, Button, DropdownMenu } from '@a-type/ui';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { LoginDialog } from './LoginDialog';

export interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const { data: account } = useSuspenseQuery(userAccountQueryOptions);
  const logout = useServerFn(logoutFn);

  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={<Button emphasis="ghost" size="small" />}
          aria-label="User menu"
          className={className}
        >
          <Button.Icon
            render={<Avatar name={account?.handle ?? undefined} size="16px" />}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {account ? (
            <DropdownMenu.Item
              className="@mode-attention"
              onClick={() => logout()}
            >
              {m.equal_zany_marlin_feel()}
            </DropdownMenu.Item>
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
    </>
  );
}
