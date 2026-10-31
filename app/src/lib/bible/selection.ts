import type { VerseId } from './verse';
import { parseVerseId } from './verse';

type VerseToken = number | 'start' | 'end';

interface VerseEndpoint {
  chapter?: number;
  verse: VerseToken;
}

export interface VerseRange {
  start: VerseEndpoint;
  end: VerseEndpoint;
}

function parseEndpoint(value: string): VerseEndpoint | undefined {
  const match = /^(?:([1-9]\d*):)?([1-9]\d*|start|end)$/.exec(value.trim());
  if (!match) return undefined;
  const chapter = match[1] ? Number(match[1]) : undefined;
  const verse =
    match[2] === 'start' || match[2] === 'end' ? match[2] : Number(match[2]);
  if (
    (chapter !== undefined && !Number.isSafeInteger(chapter)) ||
    (typeof verse === 'number' && !Number.isSafeInteger(verse))
  )
    return undefined;
  return { ...(chapter === undefined ? {} : { chapter }), verse };
}

export function parseVerseSelection(value: unknown): VerseRange[] {
  if (typeof value !== 'string') return [];
  return value.split(',').flatMap((part) => {
    const endpoints = part.split('-');
    if (endpoints.length > 2) return [];
    const start = parseEndpoint(endpoints[0]);
    const end = endpoints.length === 2 ? parseEndpoint(endpoints[1]) : start;
    return start && end ? [{ start, end }] : [];
  });
}

function formatEndpoint(endpoint: VerseEndpoint): string {
  return `${endpoint.chapter === undefined ? '' : `${endpoint.chapter}:`}${endpoint.verse}`;
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

export function resolveVerseSelection(
  value: unknown,
  chapter: number,
  availableVerses: readonly VerseId[],
): VerseId[] {
  const verses = availableVerses.map((id) => ({ id, ...parseVerseId(id) }));
  const ranges = parseVerseSelection(value);
  const bounds = new Map<number, { first: number; last: number }>();
  for (const verse of verses) {
    const previous = bounds.get(verse.chapter);
    bounds.set(verse.chapter, {
      first: Math.min(previous?.first ?? verse.verse, verse.verse),
      last: Math.max(previous?.last ?? verse.verse, verse.verse),
    });
  }
  const resolveEndpoint = (endpoint: VerseEndpoint) => {
    const resolvedChapter = endpoint.chapter ?? chapter;
    const boundary = bounds.get(resolvedChapter);
    if (!boundary) return undefined;
    return {
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
    left: { chapter: number; verse: number },
    right: { chapter: number; verse: number },
  ) => left.chapter - right.chapter || left.verse - right.verse;
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
