import { createFileRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '#/components/app/AppShell';
import { Introduction } from '#/components/home/Introduction';
import { Lectionary } from '#/components/home/Lectionary';
import {
  getMostRecentlyVisitedReadingTab,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';
import { getVisitedBefore } from '#/lib/firstTimeUse/visitedBeforeState';
import { formatLectionaryDate } from '#/lib/lectionary';
import { lectionaryReadingsQueryOptions } from '#/queries/lectionary';

export const Route = createFileRoute('/')({
  loader: ({ location, context }) => {
    const tab = location.state.skipHomeRestore
      ? undefined
      : getMostRecentlyVisitedReadingTab();
    if (tab) {
      visitReadingTab(tab.id);
      throw redirect({
        to: '/$translation/$book/$chapter',
        params: {
          translation: tab.translationId,
          book: tab.bookId,
          chapter: String(tab.chapter),
        },
        state: { activeReadingTabId: tab.id },
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
    <AppShell>{!visitedBefore ? <Introduction /> : <Lectionary />}</AppShell>
  );
}
