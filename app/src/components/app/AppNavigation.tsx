import {
  Button,
  HorizontalList,
  Icon,
  Tooltip,
  useLocalStorage,
} from '@a-type/ui';
import { useLocation } from '@tanstack/react-router';
import {
  useAddReadingTab,
  useCloseReadingTab,
  useReadingTabsState,
} from './readingTabs';

import { m } from '#/paraglide/messages';
import { getInitialTranslationBook } from '../../lib/bible/manifests';
import {
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
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeReadingTabId = useReadingTabRouteState();
  const { data: selectedTranslation } = useTranslationManifest(
    readStoredTranslationId(),
  );
  const initialBook = selectedTranslation
    ? getInitialTranslationBook(selectedTranslation)
    : undefined;

  const readingTabs = useReadingTabsState();
  const closeReadingTab = useCloseReadingTab();

  const addReadingTab = useAddReadingTab();

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
        >
          <Icon name="home" />
        </NavTab>
        <NavTab
          tooltip={m.app_tab_search()}
          location="/search"
          active={pathname === '/search'}
          aria-label={m.app_tab_search()}
        >
          <Icon name="search" />
        </NavTab>
        <NavTab
          tooltip={m.app_tab_social()}
          location="/social"
          active={pathname === '/social'}
          aria-label={m.app_tab_social()}
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
              locationResetScroll={destination.resetScroll}
              locationSearch={destination.search}
              locationHash={destination.hash}
              locationMask={destination.mask}
              active={activeReadingTabId === tab.id}
              tooltip={`${tab.position?.bookId ?? tab.bookId} ${tab.position?.chapter ?? tab.chapter}`}
              onClick={() => visitReadingTab(tab.id)}
              onClose={() => closeReadingTab(tab.id)}
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
