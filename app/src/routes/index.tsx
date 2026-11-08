import { createFileRoute, redirect } from '@tanstack/react-router';

import { InstallHint } from '#/components/app/InstallHint';
import { m } from '#/paraglide/messages';
import { ScrollArea } from '@a-type/ui';
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
          {!visitedBefore ? <Introduction /> : <Lectionary />}
        </ScrollArea.Content>
      </ScrollArea>
    </AppShell>
  );
}
