import type { BibleLocation } from './location';
import { parseBibleLocation } from './location';
import { isTranslationId } from './manifests';
import { normalizeVerseSelection } from './selection';

export interface ReadingTab extends BibleLocation {
  id: string;
  translationId: string;
  createdAt: number;
  visitedAt: number;
  verses?: string;
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

export function createReadingTab(
  translationId: string,
  location: BibleLocation & { verses?: string } = { bookId: 'GEN', chapter: 1 },
): ReadingTab {
  const now = Date.now();
  const tab: ReadingTab = {
    id: crypto.randomUUID(),
    translationId,
    ...location,
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
    tabs: state.tabs.map((tab) =>
      tab.id === activeReadingTabId
        ? { ...tab, ...location, translationId, verses, visitedAt: Date.now() }
        : tab,
    ),
  });
}

export function subscribeToReadingTabs(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function writeReadingTabsState(state: ReadingTabsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(CHANGE_EVENT));
}
