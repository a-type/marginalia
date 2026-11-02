import { resolveBookName } from './book-names';
import type { BookId, VerseId } from './verse';
import { formatVerseId, isBookId, parseVerseId } from './verse';

export interface BibleLocation {
  bookId: BookId;
  chapter: number;
}

export interface BibleReference extends BibleLocation {
  verse?: number;
  verseLabel: string;
  ranges: CitationRange[];
}

interface CitationEndpoint {
  chapter: number;
  verse: number | 'start' | 'end';
}

interface CitationRange {
  start: CitationEndpoint;
  end: CitationEndpoint;
}

function parsePassage(value: string): Omit<BibleReference, 'bookId'> | null {
  const match = /^([1-9]\d*)(?::(.+)|-([1-9]\d*))?$/.exec(value);
  if (!match) return null;
  const chapter = Number(match[1]);
  if (!Number.isSafeInteger(chapter)) return null;
  let currentChapter = chapter;
  const selection = match[2]
    ? match[2]
        .split(/[,;]/)
        .map((part) => {
          const explicitChapter = /^([1-9]\d*):/.exec(part);
          if (explicitChapter) currentChapter = Number(explicitChapter[1]);
          const endpoints = part.split('-').map((endpoint) => {
            if (endpoint.includes(':')) return endpoint;
            return currentChapter === chapter
              ? endpoint
              : `${currentChapter}:${endpoint}`;
          });
          const endChapter = /^([1-9]\d*):/.exec(endpoints[1] ?? '');
          if (endChapter) currentChapter = Number(endChapter[1]);
          return endpoints.join('-');
        })
        .join(',')
    : match[3]
      ? `${chapter}:start-${match[3]}:end`
      : 'start-end';
  const ranges: CitationRange[] = [];
  for (const part of selection.split(',')) {
    const rangeMatch =
      /^((?:[1-9]\d*:)?(?:[1-9]\d*|start|end))(?:-((?:[1-9]\d*:)?(?:[1-9]\d*|start|end)))?$/.exec(
        part,
      );
    if (!rangeMatch) return null;
    const endpoint = (text: string): CitationEndpoint | null => {
      const [chapterPart, versePart] = text.includes(':')
        ? text.split(':')
        : [String(chapter), text];
      const endpointChapter = Number(chapterPart);
      const verse =
        versePart === 'start' || versePart === 'end'
          ? versePart
          : Number(versePart);
      if (
        !Number.isSafeInteger(endpointChapter) ||
        (typeof verse === 'number' && !Number.isSafeInteger(verse))
      )
        return null;
      return { chapter: endpointChapter, verse };
    };
    const start = endpoint(rangeMatch[1]);
    const end = endpoint(rangeMatch[2] ? rangeMatch[2] : rangeMatch[1]);
    if (!start || !end) return null;
    ranges.push({ start, end });
  }
  const firstVerse = ranges[0].start.verse;
  return {
    chapter,
    ...(typeof firstVerse === 'number' ? { verse: firstVerse } : {}),
    verseLabel: selection,
    ranges,
  };
}

export function referenceNeedsVerses(reference: BibleReference): boolean {
  return reference.ranges.some(
    ({ start, end }) =>
      typeof start.verse !== 'number' || typeof end.verse !== 'number',
  );
}

export function referenceVerseSelection(
  reference: BibleReference,
  availableVerses: readonly VerseId[] = [],
): string | undefined {
  const verses = availableVerses.map(parseVerseId);
  const endpointId = ({
    chapter,
    verse,
  }: CitationEndpoint): VerseId | undefined => {
    if (typeof verse === 'number')
      return formatVerseId(reference.bookId, chapter, verse);
    const chapterVerses = verses.filter(
      (item) => item.bookId === reference.bookId && item.chapter === chapter,
    );
    if (!chapterVerses.length) return undefined;
    const numbers = chapterVerses.map((item) => item.verse);
    return formatVerseId(
      reference.bookId,
      chapter,
      verse === 'start' ? Math.min(...numbers) : Math.max(...numbers),
    );
  };
  const ranges: string[] = [];
  for (const { start, end } of reference.ranges) {
    const first = endpointId(start);
    const last = endpointId(end);
    if (!first || !last) return undefined;
    ranges.push(first === last ? first : `${first}-${last}`);
  }
  return ranges.join(',');
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

export function parseBibleReference(value = ''): BibleReference | null {
  const match = /^(\S+)\s+(.+)$/.exec(value.trim());
  if (!match) return null;
  const passage = parsePassage(match[2]);
  return isBookId(match[1]) && passage
    ? { bookId: match[1], ...passage }
    : null;
}

/** Resolve a citation, including discontinuous and optional verses. */
export function parseScriptureCitation(
  citation: string,
): BibleReference | null {
  const match = /^(.+?)\s+(\(?[1-9]\d*.*)$/.exec(citation.trim());
  if (!match) return null;
  const bookId = resolveBookName(match[1]);
  if (!bookId) return null;
  const passage = parsePassage(
    match[2]
      .replace(/(\d)\s*\(/g, '$1,(')
      .replace(/[\s()[\]]/g, '')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/(\d)[a-f]/gi, '$1'),
  );
  return passage ? { bookId, ...passage } : null;
}
