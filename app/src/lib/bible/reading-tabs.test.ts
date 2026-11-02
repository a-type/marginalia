import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createReadingTab,
  getMostRecentlyVisitedReadingTab,
  getReadingTabDestination,
  parseReadingTabsState,
  readReadingTabsState,
  storeReadingTabLocation,
  storeReadingTabPosition,
  visitReadingTab,
} from './reading-tabs';

const storageData = new Map<string, string>();
const storage: Storage = {
  get length() {
    return storageData.size;
  },
  clear: () => storageData.clear(),
  getItem: (key) => storageData.get(key) ?? null,
  key: (index) => [...storageData.keys()][index] ?? null,
  removeItem: (key) => storageData.delete(key),
  setItem: (key, value) => storageData.set(key, String(value)),
};

describe('reading tabs', () => {
  beforeEach(() => {
    storageData.clear();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores malformed tabs and does not retain route state', () => {
    expect(
      parseReadingTabsState({
        activeTabId: 'missing',
        tabs: [
          {
            id: 'valid',
            translationId: 'eng_webu',
            bookId: 'GEN',
            chapter: 1,
            createdAt: 10,
            visitedAt: 20,
          },
          { id: 'invalid', bookId: 'GEN', chapter: 0 },
        ],
      }),
    ).toEqual({
      tabs: [
        {
          id: 'valid',
          translationId: 'eng_webu',
          bookId: 'GEN',
          chapter: 1,
          createdAt: 10,
          visitedAt: 20,
        },
      ],
    });
  });

  it('restores the tab with the most recent visit timestamp', () => {
    storage.setItem(
      'margins:reading-tabs',
      JSON.stringify({
        tabs: [
          {
            id: 'older',
            translationId: 'eng_webu',
            bookId: 'GEN',
            chapter: 1,
            createdAt: 10,
            visitedAt: 20,
          },
          {
            id: 'newer',
            translationId: 'eng_asv',
            bookId: 'JHN',
            chapter: 3,
            createdAt: 30,
            visitedAt: 40,
          },
        ],
      }),
    );

    expect(getMostRecentlyVisitedReadingTab()).toMatchObject({
      id: 'newer',
      translationId: 'eng_asv',
      bookId: 'JHN',
      chapter: 3,
    });
  });

  it('updates an existing tab when its reading location changes', () => {
    storage.setItem(
      'margins:reading-tabs',
      JSON.stringify({
        tabs: [
          {
            id: 'existing',
            translationId: 'eng_webu',
            bookId: 'GEN',
            chapter: 1,
            createdAt: 10,
            visitedAt: 20,
          },
        ],
      }),
    );

    storeReadingTabLocation(
      'existing',
      { bookId: 'GEN', chapter: 2 },
      'eng_webu',
    );

    expect(readReadingTabsState().tabs).toHaveLength(1);
    expect(readReadingTabsState().tabs[0]).toMatchObject({
      id: 'existing',
      bookId: 'GEN',
      chapter: 2,
    });
  });

  it('restores a scrolled position without losing the original selection', () => {
    const tab = createReadingTab('eng_webu', {
      bookId: 'JHN',
      chapter: 3,
      verses: '3:8-4:2',
    });
    storeReadingTabPosition(tab.id, tab, tab.translationId, {
      bookId: 'JHN',
      chapter: 4,
    });
    const restored = readReadingTabsState().tabs[0];
    expect(restored.verses).toBe('3:8-4:2');
    expect(getReadingTabDestination(restored)).toMatchObject({
      params: { book: 'JHN', chapter: '3' },
      search: { verses: '3:8-4:2' },
      state: {
        activeReadingTabId: tab.id,
        readingPosition: { bookId: 'JHN', chapter: 4 },
      },
      hash: '',
    });
  });

  it('restores a reading range and clears it when navigating without a selection', () => {
    storage.setItem(
      'margins:reading-tabs',
      JSON.stringify({
        tabs: [
          {
            id: 'range',
            translationId: 'eng_webu',
            bookId: 'JHN',
            chapter: 3,
            verses: '3:8-4:2',
            createdAt: 10,
            visitedAt: 20,
          },
        ],
      }),
    );
    expect(readReadingTabsState().tabs[0].verses).toBe('3:8-4:2');
    storeReadingTabLocation('range', { bookId: 'JHN', chapter: 4 }, 'eng_webu');
    expect(readReadingTabsState().tabs[0].verses).toBeUndefined();
  });

  it.each(['2-3,5', '3:8-4:2', 'start-end'])(
    'captures and restores the supplied selection %s without changing it on visits',
    (verses) => {
      const tab = createReadingTab('eng_webu', {
        bookId: 'JHN',
        chapter: 3,
        verses,
      });
      const other = createReadingTab('eng_webu', { bookId: 'GEN', chapter: 1 });
      visitReadingTab(other.id);
      visitReadingTab(tab.id);
      storeReadingTabLocation(tab.id, tab, tab.translationId, verses);
      const restored = readReadingTabsState().tabs[0];
      expect(restored.verses).toBe(verses);
      expect(getReadingTabDestination(restored)).toMatchObject({
        params: { translation: 'eng_webu', book: 'JHN', chapter: '3' },
        state: { activeReadingTabId: tab.id },
        search: { verses },
        hash:
          verses === 'start-end'
            ? ''
            : verses === '3:8-4:2'
              ? 'verse-JHN/3:8'
              : 'verse-JHN/3:2',
      });
    },
  );

  it.each([undefined, '2', '4-5'])(
    'discards the saved range when selection changes to %s and never saves later selections',
    (verses) => {
      const tab = createReadingTab('eng_webu', {
        bookId: 'JHN',
        chapter: 3,
        verses: '2-3',
      });
      const other = createReadingTab('eng_webu', {
        bookId: 'JHN',
        chapter: 3,
        verses: '5-6',
      });
      storeReadingTabLocation(tab.id, tab, tab.translationId, verses);
      expect(
        getReadingTabDestination(readReadingTabsState().tabs[0]).search,
      ).toEqual({});
      storeReadingTabLocation(tab.id, tab, tab.translationId, '2-3');
      expect(readReadingTabsState().tabs[0].verses).toBeUndefined();
      expect(readReadingTabsState().tabs[1].verses).toBe(other.verses);
    },
  );

  it('does not save a selection made in a tab opened without one', () => {
    const tab = createReadingTab('eng_webu', { bookId: 'JHN', chapter: 3 });
    storeReadingTabLocation(tab.id, tab, tab.translationId, '2-3');
    expect(readReadingTabsState().tabs[0].verses).toBeUndefined();
  });

  it('normalizes supplied selections before storing them', () => {
    const tab = createReadingTab('eng_webu', {
      bookId: 'JHN',
      chapter: 3,
      verses: ' 2 - 3 , invalid ',
    });
    expect(tab.verses).toBe('2-3');
    expect(readReadingTabsState().tabs[0].verses).toBe('2-3');
  });
});
