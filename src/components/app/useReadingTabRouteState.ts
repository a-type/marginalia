import {
  useCanGoBack,
  useLocation,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useEffect } from 'react';

import {
  createReadingTab,
  readReadingTabsState,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';

export function useReadingTabRouteState(): string | undefined {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const { pathname, search, hash, state } = useLocation({
    select: (location) => ({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state,
    }),
  });
  const routeMatch = /^\/([^/]+)\/([^/]+)\/([1-9]\d*)$/.exec(pathname);
  const activeReadingTabId = routeMatch ? state.activeReadingTabId : undefined;

  useEffect(() => {
    const match = /^\/([^/]+)\/([^/]+)\/([1-9]\d*)$/.exec(pathname);
    if (!match) return;

    const currentTabs = readReadingTabsState().tabs;
    if (activeReadingTabId) {
      if (currentTabs.some((tab) => tab.id === activeReadingTabId)) return;
      if (canGoBack) router.history.back();
      else void navigate({ to: '/', replace: true });
      return;
    }

    const [, translationId, bookId, chapterValue] = match;
    const matchingTab = currentTabs
      .filter(
        (tab) =>
          tab.translationId === translationId &&
          tab.bookId === bookId &&
          tab.chapter === Number(chapterValue),
      )
      .reduce<(typeof currentTabs)[number] | undefined>(
        (latest, tab) =>
          !latest || tab.visitedAt > latest.visitedAt ? tab : latest,
        undefined,
      );
    const tab =
      matchingTab ??
      createReadingTab(translationId, {
        bookId,
        chapter: Number(chapterValue),
      });
    if (matchingTab) visitReadingTab(matchingTab.id);

    void navigate({
      to: pathname,
      search: (previous) => ({ ...previous, ...search }),
      hash,
      state: (previous) => ({
        ...previous,
        activeReadingTabId: tab.id,
      }),
      replace: true,
    });
  }, [activeReadingTabId, navigate, pathname, canGoBack, router]);

  return activeReadingTabId;
}
