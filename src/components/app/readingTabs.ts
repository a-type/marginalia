import {
  createReadingTab,
  readReadingTabsState,
  subscribeToReadingTabs,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';
import { setVisitedBefore } from '#/lib/firstTimeUse/visitedBeforeState';
import { formatVerseId } from '#/lib/bible/verse';
import { parseVerseSelection } from '#/lib/bible/selection';
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
    verses = tab.verses,
  ) => {
    const first = parseVerseSelection(verses).at(0)?.start;
    const verse = typeof first?.verse === 'number' ? first.verse : undefined;
    visitReadingTab(tab.id);
    void navigate({
      to: '/$translation/$book/$chapter',
      params: {
        translation: tab.translationId,
        book: tab.bookId,
        chapter: String(tab.chapter),
      },
      state: { activeReadingTabId: tab.id },
      search: verses ? { verses } : {},
      hash: verse
        ? `verse-${formatVerseId(tab.bookId, first?.chapter ?? tab.chapter, verse)}`
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
