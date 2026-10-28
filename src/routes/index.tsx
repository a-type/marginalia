import { createFileRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '#/components/app/AppShell';
import {
  getMostRecentlyVisitedReadingTab,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';

export const Route = createFileRoute('/')({
  ssr: false,
  loader: ({ location }) => {
    if (location.state.skipHomeRestore) return;
    const tab = getMostRecentlyVisitedReadingTab();
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
  },
  component: HomePage,
});

function HomePage() {
  return <AppShell />;
}
