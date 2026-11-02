import type { TranslationManifest } from './manifests';
import type { VerseId } from './verse';
import { isValidVerseId, parseVerseId } from './verse';

export interface VerseRange {
  start: VerseId;
  end: VerseId;
}

export function parseVerseSelection(value: unknown): VerseRange[] {
  if (typeof value !== 'string') return [];
  return value.split(',').flatMap((part) => {
    const match =
      /^([^/:,]+\/[1-9]\d*:[1-9]\d*)(?:\s*-\s*([^/:,]+\/[1-9]\d*:[1-9]\d*))?$/.exec(
        part.trim(),
      );
    if (!match) return [];
    const start = match[1];
    const end = match[2] ? match[2] : start;
    if (!isValidVerseId(start) || !isValidVerseId(end)) return [];
    for (const id of [start, end]) {
      const { chapter, verse } = parseVerseId(id);
      if (!Number.isSafeInteger(chapter) || !Number.isSafeInteger(verse))
        return [];
    }
    return [{ start, end }];
  });
}

export function normalizeVerseSelection(value: unknown): string {
  return parseVerseSelection(value)
    .map(({ start, end }) => (start === end ? start : `${start}-${end}`))
    .join(',');
}

export function selectionBookRanges(value: unknown) {
  const ranges = parseVerseSelection(value).map(({ start, end }) => ({
    start: parseVerseId(start).bookId,
    end: parseVerseId(end).bookId,
  }));
  return ranges
    .filter(
      (range, index) =>
        ranges.findIndex(
          (other) => other.start === range.start && other.end === range.end,
        ) === index,
    )
    .sort(
      (left, right) =>
        left.start.localeCompare(right.start) ||
        left.end.localeCompare(right.end),
    );
}

export function selectionBookIds(
  ranges: ReturnType<typeof selectionBookRanges>,
  bookId: string,
  manifest: TranslationManifest,
): string[] {
  const books = manifest.books;
  const included = new Set([bookId]);
  for (const { start, end } of ranges) {
    const first = books.findIndex((book) => book.id === start);
    const last = books.findIndex((book) => book.id === end);
    if (first < 0 || last < first) continue;
    for (const book of books.slice(first, last + 1)) included.add(book.id);
  }
  return books.filter((book) => included.has(book.id)).map((book) => book.id);
}

export function resolveVerseSelection(
  value: unknown,
  availableVerses: readonly VerseId[],
): VerseId[] {
  const verses = availableVerses.map((id) => ({ id, ...parseVerseId(id) }));
  const bookOrder = [...new Set(verses.map((verse) => verse.bookId))];
  const chapters = new Set(
    verses.map(({ bookId, chapter }) => `${bookId}/${chapter}`),
  );
  const compare = (
    left: { bookId: string; chapter: number; verse: number },
    right: { bookId: string; chapter: number; verse: number },
  ) =>
    bookOrder.indexOf(left.bookId) - bookOrder.indexOf(right.bookId) ||
    left.chapter - right.chapter ||
    left.verse - right.verse;
  const ranges = parseVerseSelection(value).flatMap(({ start, end }) => {
    const first = parseVerseId(start);
    const last = parseVerseId(end);
    return chapters.has(`${first.bookId}/${first.chapter}`) &&
      chapters.has(`${last.bookId}/${last.chapter}`) &&
      compare(first, last) <= 0
      ? [{ start: first, end: last }]
      : [];
  });
  return verses
    .filter((verse) =>
      ranges.some(
        ({ start, end }) =>
          compare(verse, start) >= 0 && compare(verse, end) <= 0,
      ),
    )
    .sort(compare)
    .map(({ id }) => id);
}
