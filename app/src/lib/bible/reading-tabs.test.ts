import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMostRecentlyVisitedReadingTab,
  parseReadingTabsState,
  readReadingTabsState,
  storeReadingTabLocation,
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
});
