import {
  Button,
  HorizontalList,
  Icon,
  Tooltip,
  useLocalStorage,
} from '@a-type/ui';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  useAddReadingTab,
  useNavigateToReadingTab,
  useReadingTabsState,
} from './readingTabs';

import { useTranslationManifest } from '#/components/bible/useTranslationManifest';
import { getInitialTranslationBook } from '#/lib/bible/manifests';
import {
  closeReadingTab,
  getMostRecentlyVisitedReadingTab,
  visitReadingTab,
} from '#/lib/bible/reading-tabs';
import { readStoredTranslationId } from '#/lib/bible/source';
import { m } from '#/paraglide/messages';
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
  const { data: selectedTranslation } = useTranslationManifest(
    readStoredTranslationId(),
  );
  const initialBook = selectedTranslation
    ? getInitialTranslationBook(selectedTranslation)
    : undefined;

  const readingTabs = useReadingTabsState();
  const navigateToReadingTab = useNavigateToReadingTab();

  const addReadingTab = useAddReadingTab();

  const closeReadingTabHandler = (tabId: string) => {
    const tab = readingTabs.tabs.find((item) => item.id === tabId);
    if (!tab) return;
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
            onClick={() => {
              if (!selectedTranslation || !initialBook) return;
              addReadingTab({
                translation: selectedTranslation.id,
                book: initialBook.id,
              });
            }}
          >
            <Icon name="plus" />
          </Button>
        </Tooltip>
      </HorizontalList>
    </nav>
  );
}
