import {
  useCanGoBack,
  useLocation,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import {
  createReadingTab,
  readReadingTabsState,
} from '../../lib/bible/reading-tabs';

export function useReadingTabRouteState(): string | undefined {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const pendingTab = useRef<{ historyKey: string; tabId: string } | null>(null);
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
      pendingTab.current = null;
      if (currentTabs.some((tab) => tab.id === activeReadingTabId)) return;
      if (canGoBack) router.history.back();
      else void navigate({ to: '/', replace: true });
      return;
    }

    const [, translationId, bookId, chapterValue] = match;
    const historyKey = state.__TSR_key ?? state.key ?? pathname;
    const tab =
      (pendingTab.current?.historyKey === historyKey
        ? currentTabs.find((entry) => entry.id === pendingTab.current?.tabId)
        : undefined) ??
      createReadingTab(translationId, {
        bookId,
        chapter: Number(chapterValue),
        verses: search.verses,
      });
    pendingTab.current = { historyKey, tabId: tab.id };

    void navigate({
      to: pathname,
      search: (previous) => ({ ...previous, ...search }),
      hash,
      state: (previous) => ({
        ...previous,
        activeReadingTabId: tab.id,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [
    activeReadingTabId,
    navigate,
    pathname,
    canGoBack,
    router,
    state.__TSR_key,
    state.key,
    search,
    hash,
  ]);

  return activeReadingTabId;
}
