import type { BibleLocation } from './location';
import { parseBibleLocation } from './location';

export function getMaskedReadingPosition(
  translationId: string,
  pathname: string | undefined,
): BibleLocation | undefined {
  if (!pathname) return undefined;
  const parts = pathname.split('/');
  if (parts.length !== 4 || parts[1] !== translationId) return undefined;
  return parseBibleLocation(parts[2], parts[3]) ?? undefined;
}

export function getReadingMask(
  translationId: string,
  routeLocation: BibleLocation,
  position: BibleLocation | undefined,
  search: { verses?: string; annotation?: string },
) {
  if (
    !position ||
    (position.bookId === routeLocation.bookId &&
      position.chapter === routeLocation.chapter)
  )
    return undefined;
  return {
    to: '/$translation/$book/$chapter' as const,
    params: {
      translation: translationId,
      book: position.bookId,
      chapter: String(position.chapter),
    },
    search: {
      ...(search.verses ? { verses: search.verses } : {}),
      ...(search.verses && search.annotation
        ? { annotation: search.annotation }
        : {}),
    },
    hash: '',
  };
}
