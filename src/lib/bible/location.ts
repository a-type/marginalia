import type { BookId } from '#/lib/bible/verse';
import { isBookId } from '#/lib/bible/verse';

export interface BibleLocation {
  bookId: BookId;
  chapter: number;
}

const STORAGE_KEY = 'margins:bible-location';
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

export function parseBibleReference(
  value = '',
): (BibleLocation & { verse?: number }) | null {
  const match =
    /^(\S+)\s+([1-9]\d*)(?::([1-9]\d*))?(?:-(?:[1-9]\d*:)?[1-9]\d*)?$/.exec(
      value.trim(),
    );
  if (!match) return null;

  const location = parseBibleLocation(match[1], match[2]);
  const verse = match[3] ? Number(match[3]) : undefined;
  if (
    !location ||
    !Number.isSafeInteger(location.chapter) ||
    (verse !== undefined && !Number.isSafeInteger(verse))
  ) {
    return null;
  }

  return { ...location, ...(verse === undefined ? {} : { verse }) };
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
