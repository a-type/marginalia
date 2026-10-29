import {
  createReadingTab,
  readReadingTabsState,
  subscribeToReadingTabs,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';
import { setVisitedBefore } from '#/lib/firstTimeUse/visitedBeforeState';
import { formatVerseId } from '#/lib/bible/verse';
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
  return (
    tab: (typeof readingTabs.tabs)[number],
    replace = false,
    verse?: number,
  ) => {
    visitReadingTab(tab.id);
    void navigate({
      to: '/$translation/$book/$chapter',
      params: {
        translation: tab.translationId,
        book: tab.bookId,
        chapter: String(tab.chapter),
      },
      state: { activeReadingTabId: tab.id },
      search: verse ? { verses: String(verse) } : {},
      hash: verse
        ? `verse-${formatVerseId(tab.bookId, tab.chapter, verse)}`
        : '',
      hashScrollIntoView: { block: 'center', behavior: 'instant' },
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
    verse,
    activate = true,
  }: {
    translation: string;
    book: string;
    chapter?: number;
    verse?: number;
    activate?: boolean;
  }) => {
    const tab = createReadingTab(translation, {
      bookId: book,
      chapter: chapter,
    });
    if (activate) navigateToReadingTab(tab, false, verse);
    setVisitedBefore();
    return tab;
  };
  return addReadingTab;
}
