import {
  createReadingTab,
  readReadingTabsState,
  subscribeToReadingTabs,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

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
      to: '/$translation/$book/$chapter',
      params: {
        translation: tab.translationId,
        book: tab.bookId,
        chapter: String(tab.chapter),
      },
      state: { activeReadingTabId: tab.id },
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
  }: {
    translation: string;
    book: string;
    chapter?: number;
  }) => {
    const tab = createReadingTab(translation, {
      bookId: book,
      chapter: chapter,
    });
    navigateToReadingTab(tab);
  };
  return addReadingTab;
}
