import { Box } from '@a-type/ui';

import { UserMenu } from '../auth/UserMenu';
import { AppNavigation } from './AppNavigation';
import cls from './AppShell.module.css';

export function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className={cls.root}>
      <header className={cls.header}>
        <AppNavigation />
        <UserMenu className={cls.userMenu} />
      </header>
      <div className={cls.panel}>
        <Box
          render={<main />}
          className={cls.main}
          surface="ambient"
          elevated="md"
          border
          full
          col
          overflow="clip"
        >
          {children}
        </Box>
      </div>
    </div>
  );
}
