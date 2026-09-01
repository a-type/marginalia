export type BookId = string;

/**
 * Formatted verse identifier: book_id/chapter:verse, e.g. "GEN/1:1"
 */
export type VerseId = `${BookId}/${number}:${number}`;

export function isBookId(value: string): value is BookId {
  return value.trim().length > 0 && !value.includes('/');
}

export function isValidVerseId(verseId: string): verseId is VerseId {
  const match = /^([^/]+)\/([1-9]\d*):([1-9]\d*)$/.exec(verseId);
  return Boolean(match && isBookId(match[1]));
}

export function parseVerseId(verseId: VerseId): {
  bookId: BookId;
  chapter: number;
  verse: number;
} {
  const [bookId, chapterVerse] = verseId.split('/');
  const [chapterStr, verseStr] = chapterVerse.split(':');

  return {
    bookId,
    chapter: Number(chapterStr),
    verse: Number(verseStr),
  };
}

export function formatVerseId(
  bookId: BookId,
  chapter: number,
  verse: number,
): VerseId {
  return `${bookId}/${chapter}:${verse}`;
}

export function formatVerseAnchorName(verseId: VerseId): `--verse-${string}` {
  return `--verse-${verseId.replaceAll('/', '-').replaceAll(':', '-')}`;
}
