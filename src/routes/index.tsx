import { Box } from '@a-type/ui';
import { createFileRoute } from '@tanstack/react-router';

import { AuthPanel } from '#/components/auth/AuthPanel';
import { USFMRenderer } from '#/components/usfm';
import firstJohn from '#/data/usfm-source/web/92-1JNeng-web-c.usfm?raw';
import { getCurrentAccountFn } from '#/lib/auth.functions';
import cls from './index.module.css';

export const Route = createFileRoute('/')({
  loader: () => getCurrentAccountFn(),
  component: Home,
});

function Home() {
  const account = Route.useLoaderData();

  return (
    <main className={cls.root}>
      <Box className={cls.pane}>
        <AuthPanel account={account} />
      </Box>
      <Box surface elevated="md" className={cls.content}>
        <USFMRenderer usfm={firstJohn} />
      </Box>
    </main>
  );
}
