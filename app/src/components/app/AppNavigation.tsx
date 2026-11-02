import {
  Button,
  HorizontalList,
  Icon,
  Tooltip,
  useLocalStorage,
} from '@a-type/ui';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import {
  useAddReadingTab,
  useNavigateToReadingTab,
  useReadingTabsState,
} from './readingTabs';

import { m } from '#/paraglide/messages';
import { getInitialTranslationBook } from '../../lib/bible/manifests';
import { checkpointActiveReadingPosition } from '../../lib/bible/reading-history';
import {
  closeReadingTab,
  getMostRecentlyVisitedReadingTab,
  getReadingTabDestination,
  visitReadingTab,
} from '../../lib/bible/reading-tabs';
import { readStoredTranslationId } from '../../lib/bible/source';
import { useTranslationManifest } from '../bible/useTranslationManifest';
import cls from './AppNavigation.module.css';
import { NavTab } from './NavTab';
import { useReadingTabRouteState } from './useReadingTabRouteState';

export function AppNavigation() {
  const [isExpanded, setIsExpanded] = useLocalStorage(
    'margins:nav-expanded',
    false,
  );
  const navigate = useNavigate();
  const router = useRouter();
  const checkpoint = () => checkpointActiveReadingPosition(router.history);
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
          tooltip={m.app_tab_home()}
          location="/"
          locationState={{ skipHomeRestore: true }}
          active={pathname === '/'}
          aria-label={m.app_tab_home()}
          onClick={checkpoint}
        >
          <Icon name="home" />
        </NavTab>
        <NavTab
          tooltip={m.app_tab_search()}
          location="/search"
          active={pathname === '/search'}
          aria-label={m.app_tab_search()}
          onClick={checkpoint}
        >
          <Icon name="search" />
        </NavTab>
        <NavTab
          tooltip={m.app_tab_social()}
          location="/social"
          active={pathname === '/social'}
          aria-label={m.app_tab_social()}
          onClick={checkpoint}
        >
          <Icon name="globe" />
        </NavTab>

        {readingTabs.tabs.map((tab) => {
          const destination = getReadingTabDestination(tab);
          return (
            <NavTab
              key={tab.id}
              data-tab-id={tab.id}
              location={`/${tab.translationId}/${tab.bookId}/${tab.chapter}`}
              locationState={destination.state}
              locationSearch={destination.search}
              locationHash={destination.hash}
              active={activeReadingTabId === tab.id}
              tooltip={`${tab.position?.bookId ?? tab.bookId} ${tab.position?.chapter ?? tab.chapter}`}
              onClick={() => {
                checkpoint();
                visitReadingTab(tab.id);
              }}
              onClose={() => closeReadingTabHandler(tab.id)}
              className={cls.tab}
            >
              {tab.position?.bookId ?? tab.bookId}{' '}
              {tab.position?.chapter ?? tab.chapter}
            </NavTab>
          );
        })}
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
