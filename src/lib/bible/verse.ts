/**
 * Formatted verse identifier: book_id/chapter:verse, e.g. "GEN/1:1"
 */
export type VerseId = `${BookId}/${number}:${number}`;

/**
 * All deuterocanonical book IDs, in order.
 */
export const bookIds = [
  'GEN',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '2KI',
  '1CH',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'JOB',
  'PSA',
  'PRO',
  'ECC',
  'SNG',
  'ISA',
  'JER',
  'LAM',
  'EZK',
  'DAN',
  'HOS',
  'JOL',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAM',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'TOB',
  'JDT',
  'ESG',
  'WIS',
  'SIR',
  'BAR',
  '1MA',
  '2MA',
  'DAG',
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
];
export type BookId = (typeof bookIds)[number];

export function isValidVerseId(verseId: string): verseId is VerseId {
  const [bookId, chapterVerse] = verseId.split('/');
  if (!bookId || !chapterVerse) return false;
  if (!bookIds.includes(bookId)) return false;

  const [chapterStr, verseStr] = chapterVerse.split(':');
  if (!chapterStr || !verseStr) return false;

  const chapter = Number(chapterStr);
  const verse = Number(verseStr);
  if (isNaN(chapter) || isNaN(verse)) return false;

  return true;
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
