import {
  Button,
  HorizontalList,
  Icon,
  Tooltip,
  useLocalStorage,
} from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { getInitialTranslationBook } from '#/lib/bible/manifests';
import type { ReadingTabsState } from '#/lib/bible/reading-tabs';
import {
  closeReadingTab,
  createReadingTab,
  getMostRecentlyVisitedReadingTab,
  readReadingTabsState,
  subscribeToReadingTabs,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';
import { readStoredTranslationId } from '#/lib/bible/source';
import { m } from '#/paraglide/messages';
import { translationsQueryOptions } from '#/queries/translations';
import cls from './AppNavigation.module.css';
import { NavTab } from './NavTab';
import { useReadingTabRouteState } from './useReadingTabRouteState';

export function AppNavigation() {
  const [isExpanded, setIsExpanded] = useLocalStorage(
    'margins:nav-expanded',
    false,
  );
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeReadingTabId = useReadingTabRouteState();
  const translations = useQuery(translationsQueryOptions);
  const selectedTranslation = translations.data?.find(
    (translation) => translation.id === readStoredTranslationId(),
  );
  const initialBook = selectedTranslation
    ? getInitialTranslationBook(selectedTranslation.manifest)
    : undefined;
  const [readingTabs, setReadingTabs] = useState<ReadingTabsState>({
    tabs: [],
  });

  useEffect(() => {
    const updateTabs = () => setReadingTabs(readReadingTabsState());
    updateTabs();
    return subscribeToReadingTabs(updateTabs);
  }, []);

  const navigateToReadingTab = (
    tab: (typeof readingTabs.tabs)[number],
    replace = false,
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
      replace,
      viewTransition: true,
    });
  };

  const addReadingTab = () => {
    if (!selectedTranslation || !initialBook) return;
    const tab = createReadingTab(selectedTranslation.id, {
      bookId: initialBook.id,
      chapter: 1,
    });
    navigateToReadingTab(tab);
  };

  const closeReadingTabHandler = (tabId: string) => {
    const tab = readingTabs.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    setReadingTabs((current) => ({
      ...current,
      tabs: current.tabs.filter((item) => item.id !== tabId),
    }));
    closeReadingTab(tabId);
    if (activeReadingTabId !== tabId) return;

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

  return (
    <nav className={cls.navigation} aria-label={m.app_navigation_label()}>
      <HorizontalList
        open={isExpanded}
        onOpenChange={setIsExpanded}
        className={cls.tabs}
        contentClassName={cls.tabList}
      >
        <NavTab
          tooltip={m.app_tab_search()}
          location="/search"
          active={pathname === '/search'}
          aria-label={m.app_tab_search()}
        >
          <Icon name="search" />
        </NavTab>
        <NavTab
          tooltip={m.app_tab_home()}
          location="/"
          locationState={{ skipHomeRestore: true }}
          active={pathname === '/'}
          aria-label={m.app_tab_home()}
        >
          <Icon name="home" />
        </NavTab>
        <NavTab
          tooltip={m.app_tab_social()}
          location="/social"
          active={pathname === '/social'}
          aria-label={m.app_tab_social()}
        >
          <Icon name="globe" />
        </NavTab>

        {readingTabs.tabs.map((tab) => (
          <NavTab
            key={tab.id}
            data-tab-id={tab.id}
            location={`/${tab.translationId}/${tab.bookId}/${tab.chapter}`}
            locationState={{ activeReadingTabId: tab.id }}
            active={activeReadingTabId === tab.id}
            tooltip={`${tab.bookId} ${tab.chapter}`}
            onClick={() => visitReadingTab(tab.id)}
            onClose={() => closeReadingTabHandler(tab.id)}
          >
            {tab.bookId} {tab.chapter}
          </NavTab>
        ))}
        <Tooltip content={m.app_tab_add_bible()}>
          <Button
            size="small"
            emphasis="primary"
            className={cls.addTab}
            aria-label={m.app_tab_add_bible()}
            disabled={!initialBook}
            onClick={addReadingTab}
          >
            <Icon name="plus" />
          </Button>
        </Tooltip>
      </HorizontalList>
    </nav>
  );
}
