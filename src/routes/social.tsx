import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '#/components/app/AppShell';
import { SocialSidebar } from '#/components/auth/SocialSidebar';
import { SearchButton } from '#/components/search/SearchButton';
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
    <AppShell activeTab="social">
      <div className={cls.root}>
        <SearchButton className={cls.followButton} emphasis="default">
          {m.awake_jumpy_racoon_absorb()}
        </SearchButton>
        <SocialSidebar accountDid={userDidQuery.data ?? null} />
      </div>
    </AppShell>
  );
}
