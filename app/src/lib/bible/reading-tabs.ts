import { logger } from '#/logger';
import type { BibleLocation } from './location';
import { parseBibleLocation } from './location';
import { isTranslationId } from './manifests';
import { getReadingMask } from './reading-mask';
import { normalizeVerseSelection } from './selection';

export interface ReadingTab extends BibleLocation {
  id: string;
  translationId: string;
  createdAt: number;
  visitedAt: number;
  verses?: string;
  position?: BibleLocation;
  scrollProgress?: number;
}

export interface ReadingTabsState {
  tabs: ReadingTab[];
}

const STORAGE_KEY = 'margins:reading-tabs';
const CHANGE_EVENT = 'margins:reading-tabs-change';

export function readReadingTabsState(): ReadingTabsState {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
    return parseReadingTabsState(stored);
  } catch {
    return { tabs: [] };
  }
}

// TODO: use Zod for validation/parse here
export function parseReadingTabsState(value: unknown): ReadingTabsState {
  if (!value || typeof value !== 'object') return { tabs: [] };
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tabs)) return { tabs: [] };

  const tabs = record.tabs.flatMap((item): ReadingTab[] => {
    if (!item || typeof item !== 'object') return [];
    const tab = item as Record<string, unknown>;
    const location =
      typeof tab.bookId === 'string' &&
      (typeof tab.chapter === 'number' || typeof tab.chapter === 'string')
        ? parseBibleLocation(tab.bookId, tab.chapter)
        : null;

    if (
      typeof tab.id !== 'string' ||
      !tab.id ||
      typeof tab.translationId !== 'string' ||
      !isTranslationId(tab.translationId) ||
      !location ||
      typeof tab.createdAt !== 'number' ||
      !Number.isFinite(tab.createdAt) ||
      typeof tab.visitedAt !== 'number' ||
      !Number.isFinite(tab.visitedAt)
    )
      return [];

    const position =
      tab.position &&
      typeof tab.position === 'object' &&
      'bookId' in tab.position &&
      typeof tab.position.bookId === 'string' &&
      'chapter' in tab.position &&
      (typeof tab.position.chapter === 'number' ||
        typeof tab.position.chapter === 'string')
        ? parseBibleLocation(tab.position.bookId, tab.position.chapter)
        : null;
    return [
      {
        id: tab.id,
        translationId: tab.translationId,
        ...location,
        createdAt: tab.createdAt,
        visitedAt: tab.visitedAt,
        ...(normalizeVerseSelection(tab.verses)
          ? { verses: normalizeVerseSelection(tab.verses) }
          : {}),
        ...(position ? { position } : {}),
        ...(typeof tab.scrollProgress === 'number' &&
        Number.isFinite(tab.scrollProgress)
          ? { scrollProgress: tab.scrollProgress }
          : {}),
      },
    ];
  });
  return { tabs };
}

export function getMostRecentlyVisitedReadingTab(): ReadingTab | undefined {
  return readReadingTabsState().tabs.reduce<ReadingTab | undefined>(
    (mostRecent, tab) =>
      !mostRecent || tab.visitedAt > mostRecent.visitedAt ? tab : mostRecent,
    undefined,
  );
}

export function getReadingTabDestination(tab: ReadingTab) {
  const search = tab.verses ? { verses: tab.verses } : {};
  return {
    to: '/$translation/$book/$chapter' as const,
    params: {
      translation: tab.translationId,
      book: tab.bookId,
      chapter: String(tab.chapter),
    },
    state: {
      activeReadingTabId: tab.id,
    },
    resetScroll: false,
    search,
    mask: getReadingMask(tab.translationId, tab, tab.position, search),
    // Let the reader scroll after the tab renders; a link fragment can move the outgoing reader.
    hash: '',
  };
}

export function createReadingTab(
  translationId: string,
  location: BibleLocation & { verses?: string } = { bookId: 'GEN', chapter: 1 },
): ReadingTab {
  const now = Date.now();
  const tab: ReadingTab = {
    id: crypto.randomUUID(),
    translationId,
    ...location,
    verses: normalizeVerseSelection(location.verses) || undefined,
    createdAt: now,
    visitedAt: now,
  };
  const state = readReadingTabsState();
  writeReadingTabsState({ tabs: [...state.tabs, tab] });
  return tab;
}

export function closeReadingTab(tabId: string): void {
  const state = readReadingTabsState();
  if (!state.tabs.some((tab) => tab.id === tabId)) return;
  writeReadingTabsState({
    tabs: state.tabs.filter((tab) => tab.id !== tabId),
  });
}

export function visitReadingTab(id: string): void {
  const state = readReadingTabsState();
  if (!state.tabs.some((tab) => tab.id === id)) return;
  const now = Date.now();
  writeReadingTabsState({
    tabs: state.tabs.map((tab) =>
      tab.id === id ? { ...tab, visitedAt: now } : tab,
    ),
  });
}

export function storeReadingTabLocation(
  activeReadingTabId: string | undefined,
  location: BibleLocation,
  translationId: string,
  verses?: string,
): void {
  if (!activeReadingTabId) return;
  const state = readReadingTabsState();
  if (!state.tabs.some((tab) => tab.id === activeReadingTabId)) return;

  writeReadingTabsState({
    tabs: state.tabs.map((tab) => {
      if (tab.id !== activeReadingTabId) return tab;
      const sameLocation =
        tab.bookId === location.bookId &&
        tab.chapter === location.chapter &&
        tab.translationId === translationId;
      return {
        ...tab,
        ...location,
        translationId,
        verses:
          sameLocation &&
          tab.verses === (normalizeVerseSelection(verses) || undefined)
            ? tab.verses
            : undefined,
        position: sameLocation ? tab.position : undefined,
        scrollProgress: sameLocation ? tab.scrollProgress : undefined,
        visitedAt: Date.now(),
      };
    }),
  });
}

export function storeReadingTabScrollPosition(
  activeReadingTabId: string | undefined,
  routeLocation: BibleLocation,
  translationId: string,
  position: BibleLocation,
  scrollProgress: number,
): void {
  if (!activeReadingTabId || !Number.isFinite(scrollProgress)) return;
  const state = readReadingTabsState();
  const tab = state.tabs.find((entry) => entry.id === activeReadingTabId);
  if (
    !tab ||
    tab.translationId !== translationId ||
    tab.bookId !== routeLocation.bookId ||
    tab.chapter !== routeLocation.chapter
  )
    return;
  const nextPosition =
    position.bookId === routeLocation.bookId &&
    position.chapter === routeLocation.chapter
      ? undefined
      : position;
  if (
    tab.position?.bookId === nextPosition?.bookId &&
    tab.position?.chapter === nextPosition?.chapter &&
    tab.scrollProgress === scrollProgress
  )
    return;
  writeReadingTabsState(
    {
      tabs: state.tabs.map((entry) =>
        entry.id === activeReadingTabId
          ? { ...entry, position: nextPosition, scrollProgress }
          : entry,
      ),
    },
    tab.position?.bookId !== nextPosition?.bookId ||
      tab.position?.chapter !== nextPosition?.chapter,
  );
}

export function subscribeToReadingTabs(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function writeReadingTabsState(state: ReadingTabsState, notify = true): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    logger.warn('Failed to store reading tab state', error);
    return;
  }
  if (notify && typeof window !== 'undefined')
    window.dispatchEvent(new Event(CHANGE_EVENT));
}
