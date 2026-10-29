import type { BookId } from '#/lib/bible/verse';
import { isBookId } from '#/lib/bible/verse';
import { resolveBookName } from './book-names';
import { normalizeVerseSelection, parseVerseSelection } from './selection';

export interface BibleLocation {
  bookId: BookId;
  chapter: number;
}

export interface BibleReference extends BibleLocation {
  verse?: number;
  verses: string;
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
  const ranges = parseVerseSelection(selection);
  if (!ranges.length || ranges.length !== selection.split(',').length)
    return null;
  const firstVerse = ranges[0].start.verse;
  return {
    chapter,
    ...(typeof firstVerse === 'number' ? { verse: firstVerse } : {}),
    verses: normalizeVerseSelection(selection),
  };
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
