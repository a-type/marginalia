import type { BookId } from '#/lib/bible/verse';
import { isBookId } from '#/lib/bible/verse';

export interface BibleLocation {
  bookId: BookId;
  chapter: number;
}

const STORAGE_KEY = 'apostil:bible-location';
const defaultLocation: BibleLocation = { bookId: 'GEN', chapter: 1 };

export function parseBibleLocation(
  bookId: string,
  chapterValue: string | number,
): BibleLocation | null {
  const chapter = Number(chapterValue);
  if (!isBookId(bookId) || !Number.isInteger(chapter) || chapter < 1) {
    return null;
  }

  return { bookId, chapter };
}

export function readStoredBibleLocation(): BibleLocation {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
    if (!value || typeof value !== 'object') return defaultLocation;

    const { bookId, chapter } = value as Record<string, unknown>;
    if (typeof bookId !== 'string') return defaultLocation;
    if (typeof chapter !== 'string' && typeof chapter !== 'number') {
      return defaultLocation;
    }

    return parseBibleLocation(bookId, chapter) ?? defaultLocation;
  } catch {
    return defaultLocation;
  }
}

export function storeBibleLocation(location: BibleLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}
