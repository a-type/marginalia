import type { BookId } from '#/lib/bible/verse';
import { isBookId } from '#/lib/bible/verse';
import { resolveBookName } from './book-names';

export interface BibleLocation {
  bookId: BookId;
  chapter: number;
}

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

/** Locate the start of a citation, including discontinuous and optional verses. */
export function parseScriptureCitation(
  citation: string,
): (BibleLocation & { verse?: number }) | null {
  const match =
    /^(.+?)\s+\(?([1-9]\d*)(?::\s*\(?([1-9]\d*)[a-f]?)?(?:\s*[-\u2013\u2014,;()[\]](?:end|[0-9a-f:,\s;()[\]\u2013\u2014-])*)?$/i.exec(
      citation.trim(),
    );
  if (!match) return null;
  const bookId = resolveBookName(match[1]);
  if (!bookId) return null;
  const chapter = Number(match[2]);
  const verse = match[3] ? Number(match[3]) : undefined;
  if (
    !Number.isSafeInteger(chapter) ||
    (verse !== undefined && !Number.isSafeInteger(verse))
  )
    return null;
  return { bookId, chapter, ...(verse === undefined ? {} : { verse }) };
}
