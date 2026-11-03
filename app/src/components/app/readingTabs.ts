import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  createReadingTab,
  closeReadingTab,
  getMostRecentlyVisitedReadingTab,
  getReadingTabDestination,
  readReadingTabsState,
  subscribeToReadingTabs,
  visitReadingTab,
} from '../../lib/bible/reading-tabs';
import { setVisitedBefore } from '../../lib/firstTimeUse/visitedBeforeState';

export function useReadingTabsState() {
  const [state, setState] = useState(() => readReadingTabsState());
  useEffect(
    () => subscribeToReadingTabs(() => setState(readReadingTabsState())),
    [],
  );
  return state;
}

export function useNavigateToReadingTab() {
  const navigate = useNavigate();
  const readingTabs = useReadingTabsState();
  return (tab: (typeof readingTabs.tabs)[number], replace = false) => {
    visitReadingTab(tab.id);
    void navigate({
      ...getReadingTabDestination(tab),
      replace,
      viewTransition: true,
    });
  };
}

export function useAddReadingTab() {
  const navigateToReadingTab = useNavigateToReadingTab();
  const addReadingTab = ({
    translation,
    book,
    chapter = 1,
    verses,
    activate = true,
  }: {
    translation: string;
    book: string;
    chapter?: number;
    verses?: string;
    activate?: boolean;
  }) => {
    const tab = createReadingTab(translation, {
      bookId: book,
      chapter: chapter,
      verses,
    });
    if (activate) navigateToReadingTab(tab);
    setVisitedBefore();
    return tab;
  };
  return addReadingTab;
}

export function useCloseReadingTab() {
  const navigate = useNavigate();
  const navigateToReadingTab = useNavigateToReadingTab();
  const activeTabId = useLocation({
    select: (location) => location.state.activeReadingTabId,
  });
  return (tabId: string) => {
    if (!readReadingTabsState().tabs.some((tab) => tab.id === tabId)) return;
    closeReadingTab(tabId);
    if (activeTabId !== tabId) return;
    const nextTab = getMostRecentlyVisitedReadingTab();
    if (nextTab) {
      navigateToReadingTab(nextTab, true);
    } else {
      void navigate({
        to: '/',
        state: { skipHomeRestore: true },
        replace: true,
        viewTransition: true,
      });
    }
  };
}
