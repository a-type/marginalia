import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '#/components/app/AppShell';
import { SocialSidebar } from '#/components/auth/SocialSidebar';
import { FindPeopleButton } from '#/components/search/FindPeopleButton';
import { m } from '#/paraglide/messages';
import { currentUserDidQueryOptions } from '#/queries/user';
import cls from './social.module.css';

export const Route = createFileRoute('/social')({
  component: SocialPage,
});

function SocialPage() {
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });

  return (
    <AppShell>
      <div className={cls.root}>
        <FindPeopleButton className={cls.followButton} emphasis="default">
          {m.awake_jumpy_racoon_absorb()}
        </FindPeopleButton>
        <SocialSidebar accountDid={userDidQuery.data ?? null} />
      </div>
    </AppShell>
  );
}
