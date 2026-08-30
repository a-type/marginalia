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
      <AuthPanel account={account} />
      <div className={cls.card}>
        <p className={cls.label}>World English Bible</p>
        <USFMRenderer usfm={firstJohn} />
      </div>
    </main>
  );
}
