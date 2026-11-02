import type { BibleLocation } from './location';

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
