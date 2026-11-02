import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  createReadingTab,
  getReadingTabDestination,
  readReadingTabsState,
  subscribeToReadingTabs,
  visitReadingTab,
} from '../../lib/bible/reading-tabs';
import { setVisitedBefore } from '../../lib/firstTimeUse/visitedBeforeState';
import { checkpointActiveReadingPosition } from '../../lib/bible/reading-history';

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
  const router = useRouter();
  const readingTabs = useReadingTabsState();
  return (tab: (typeof readingTabs.tabs)[number], replace = false) => {
    checkpointActiveReadingPosition(router.history);
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
