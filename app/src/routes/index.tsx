import { createFileRoute, redirect } from '@tanstack/react-router';

import { InstallHint } from '#/components/app/InstallHint';
import { FollowingAnnotations } from '#/components/social/FollowingAnnotations';
import { readStoredTranslationId } from '#/lib/bible/source';
import { m } from '#/paraglide/messages';
import { followingAnnotationsQueryOptions } from '#/queries/social';
import { currentUserDidQueryOptions } from '#/queries/user';
import { Divider, ScrollArea } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../components/app/AppShell';
import { Introduction } from '../components/home/Introduction';
import { Lectionary } from '../components/home/Lectionary';
import {
  getMostRecentlyVisitedReadingTab,
  getReadingTabDestination,
  visitReadingTab,
} from '../lib/bible/reading-tabs';
import { getVisitedBefore } from '../lib/firstTimeUse/visitedBeforeState';
import { formatLectionaryDate } from '../lib/lectionary';
import { lectionaryReadingsQueryOptions } from '../queries/lectionary';

export const Route = createFileRoute('/')({
  loader: ({ location, context }) => {
    const tab = location.state.skipHomeRestore
      ? undefined
      : getMostRecentlyVisitedReadingTab();
    if (tab) {
      visitReadingTab(tab.id);
      throw redirect({
        ...getReadingTabDestination(tab),
        replace: true,
      });
    }
    if (getVisitedBefore()) {
      void context.queryClient.prefetchQuery(
        lectionaryReadingsQueryOptions(formatLectionaryDate(new Date()), 'rcl'),
      );
    }

    void context.queryClient
      .prefetchQuery(currentUserDidQueryOptions)
      .then(() => {
        const did = context.queryClient.getQueryData(
          currentUserDidQueryOptions.queryKey,
        );
        if (did)
          void context.queryClient.prefetchInfiniteQuery(
            followingAnnotationsQueryOptions(did),
          );
      });
    return readStoredTranslationId();
  },
  component: HomePage,
});

function HomePage() {
  const visitedBefore = getVisitedBefore();
  return (
    <AppShell>
      <InstallHint content={m.install_hint()} />
      <ScrollArea>
        <ScrollArea.Content>
          {!visitedBefore ? <Introduction /> : <LoggedInContent />}
        </ScrollArea.Content>
      </ScrollArea>
    </AppShell>
  );
}

function LoggedInContent() {
  const userDidQuery = useQuery(currentUserDidQueryOptions);
  const translationId = Route.useLoaderData();
  return (
    <>
      <Lectionary readingTypes={['daily', 'red_letter']} />
      <Divider />
      {userDidQuery.data && (
        <FollowingAnnotations
          accountDid={userDidQuery.data}
          translationId={translationId}
        />
      )}
    </>
  );
}
