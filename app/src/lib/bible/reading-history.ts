import type { AnyRouter } from '@tanstack/react-router';
import type { BibleLocation } from './location';
import { readReadingTabsState } from './reading-tabs';

export function checkpointReadingPosition(
  history: AnyRouter['history'],
  position: BibleLocation,
) {
  const current = history.location;
  const saved = current.state.readingPosition;
  if (saved?.bookId === position.bookId && saved.chapter === position.chapter)
    return;
  history.replace(current.href, {
    ...current.state,
    readingPosition: position,
  });
}

export function checkpointActiveReadingPosition(history: AnyRouter['history']) {
  const tabId = history.location.state.activeReadingTabId;
  const tab = readReadingTabsState().tabs.find((entry) => entry.id === tabId);
  if (tab?.position) checkpointReadingPosition(history, tab.position);
}
