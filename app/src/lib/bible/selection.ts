import type { VerseId } from './verse';
import { parseVerseId } from './verse';
import type { TranslationManifest } from './manifests';

type VerseToken = number | 'start' | 'end';

interface VerseEndpoint {
  bookId?: string;
  chapter?: number;
  verse: VerseToken;
}

export interface VerseRange {
  start: VerseEndpoint;
  end: VerseEndpoint;
}

function parseEndpoint(value: string): VerseEndpoint | undefined {
  const match = /^(?:([^/:,]+)\/)?(?:([1-9]\d*):)?([1-9]\d*|start|end)$/.exec(
    value.trim(),
  );
  if (!match) return undefined;
  const chapter = match[2] ? Number(match[2]) : undefined;
  const verse =
    match[3] === 'start' || match[3] === 'end' ? match[3] : Number(match[3]);
  if (match[1] && chapter === undefined) return undefined;
  if (
    (chapter !== undefined && !Number.isSafeInteger(chapter)) ||
    (typeof verse === 'number' && !Number.isSafeInteger(verse))
  )
    return undefined;
  return {
    ...(match[1] ? { bookId: match[1] } : {}),
    ...(chapter === undefined ? {} : { chapter }),
    verse,
  };
}

export function parseVerseSelection(value: unknown): VerseRange[] {
  if (typeof value !== 'string') return [];
  return value.split(',').flatMap((part) => {
    const endpoints =
      /^([1-9]\d*|start|end)\s*-\s*((?:[^/:,]+\/)(?:[1-9]\d*:)?(?:[1-9]\d*|start|end))$/.exec(
        part.trim(),
      ) ??
      /^((?:[^/:,]+\/)?(?:[1-9]\d*:)?(?:[1-9]\d*|start|end))(?:\s*-\s*((?:[^/:,]+\/)?(?:[1-9]\d*:)?(?:[1-9]\d*|start|end)))?$/.exec(
        part.trim(),
      );
    if (!endpoints) return [];
    const start = parseEndpoint(endpoints[1]);
    const end = endpoints[2] ? parseEndpoint(endpoints[2]) : start;
    return start && end ? [{ start, end }] : [];
  });
}

function formatEndpoint(endpoint: VerseEndpoint): string {
  return `${endpoint.bookId ? `${endpoint.bookId}/` : ''}${endpoint.chapter === undefined ? '' : `${endpoint.chapter}:`}${endpoint.verse}`;
}

export function normalizeVerseSelection(value: unknown): string {
  return parseVerseSelection(value)
    .map(({ start, end }) => {
      const first = formatEndpoint(start);
      const last = formatEndpoint(end);
      return first === last ? first : `${first}-${last}`;
    })
    .join(',');
}

export function formatVerseSelection(verses: readonly number[]): string {
  return [...new Set(verses)].sort((left, right) => left - right).join(',');
}

export function selectionBookRanges(value: unknown) {
  const ranges = parseVerseSelection(value).flatMap(({ start, end }) =>
    start.bookId || end.bookId
      ? [{ start: start.bookId ?? '', end: end.bookId ?? '' }]
      : [],
  );
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
    const first = books.findIndex((book) => book.id === (start || bookId));
    const last = books.findIndex((book) => book.id === (end || bookId));
    if (first < 0 || last < first) continue;
    for (const book of books.slice(first, last + 1)) included.add(book.id);
  }
  return books.filter((book) => included.has(book.id)).map((book) => book.id);
}

export function resolveVerseSelection(
  value: unknown,
  chapter: number,
  availableVerses: readonly VerseId[],
  bookId = availableVerses[0] ? parseVerseId(availableVerses[0]).bookId : '',
): VerseId[] {
  const verses = availableVerses.map((id) => ({ id, ...parseVerseId(id) }));
  const ranges = parseVerseSelection(value);
  const bookOrder = [...new Set(verses.map((verse) => verse.bookId))];
  const bounds = new Map<string, { first: number; last: number }>();
  for (const verse of verses) {
    const key = `${verse.bookId}/${verse.chapter}`;
    const previous = bounds.get(key);
    bounds.set(key, {
      first: Math.min(previous?.first ?? verse.verse, verse.verse),
      last: Math.max(previous?.last ?? verse.verse, verse.verse),
    });
  }
  const resolveEndpoint = (endpoint: VerseEndpoint) => {
    const resolvedBook = endpoint.bookId ?? bookId;
    const resolvedChapter = endpoint.chapter ?? chapter;
    const boundary = bounds.get(`${resolvedBook}/${resolvedChapter}`);
    if (!boundary) return undefined;
    return {
      bookId: resolvedBook,
      chapter: resolvedChapter,
      verse:
        endpoint.verse === 'start'
          ? boundary.first
          : endpoint.verse === 'end'
            ? boundary.last
            : endpoint.verse,
    };
  };
  const compare = (
    left: { bookId: string; chapter: number; verse: number },
    right: { bookId: string; chapter: number; verse: number },
  ) =>
    bookOrder.indexOf(left.bookId) - bookOrder.indexOf(right.bookId) ||
    left.chapter - right.chapter ||
    left.verse - right.verse;
  const resolvedRanges = ranges.flatMap((range) => {
    const start = resolveEndpoint(range.start);
    const end = resolveEndpoint(range.end);
    return start && end && compare(start, end) <= 0 ? [{ start, end }] : [];
  });

  return verses
    .filter((verse) =>
      resolvedRanges.some(
        ({ start, end }) =>
          compare(verse, start) >= 0 && compare(verse, end) <= 0,
      ),
    )
    .sort(compare)
    .map(({ id }) => id);
}
