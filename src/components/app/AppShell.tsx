import { Box, Tabs } from '@a-type/ui';
import { useNavigate } from '@tanstack/react-router';

import { UserMenu } from '#/components/auth/UserMenu';
import { m } from '#/paraglide/messages';
import cls from './AppShell.module.css';

export type AppTab = 'read' | 'search' | 'social';

export function AppShell({
  activeTab,
  children,
}: {
  activeTab: AppTab;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <Tabs
      className={cls.root}
      value={activeTab}
      onValueChange={(value) => {
        if (value === 'read') void navigate({ to: '/', viewTransition: true });
        if (value === 'search')
          void navigate({ to: '/search', viewTransition: true });
        if (value === 'social')
          void navigate({ to: '/social', viewTransition: true });
      }}
    >
      <header className={cls.header}>
        <Tabs.List
          className={cls.tabs}
          color="gray"
          aria-label={m.app_navigation_label()}
        >
          <Tabs.Trigger className={cls.tab} value="read">
            {m.app_tab_read()}
          </Tabs.Trigger>
          <Tabs.Trigger className={cls.tab} value="search">
            {m.app_tab_search()}
          </Tabs.Trigger>
          <Tabs.Trigger className={cls.tab} value="social">
            {m.app_tab_social()}
          </Tabs.Trigger>
        </Tabs.List>
        <UserMenu className={cls.userMenu} />
      </header>
      <Tabs.Content value={activeTab} className={cls.panel}>
        <Box
          render={<main />}
          className={cls.main}
          surface="ambient"
          elevated="md"
          border
          full
          col
        >
          {children}
        </Box>
      </Tabs.Content>
    </Tabs>
  );
}
