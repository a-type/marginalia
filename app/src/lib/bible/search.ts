import { parseUSFMCached } from '../../components/usfm/parser';
import type { USFMNode } from '../../components/usfm/types';
import type { AnnotationRecord } from '../annotations/collections';
import { AppError } from '../error';
import type { HighlightRecord } from '../highlights/collections';
import type { VerseId } from './verse';
import { formatVerseId, parseVerseLabel } from './verse';

export const corpusVersion = 1;

export interface SearchVerse {
  id: VerseId;
  label: string;
  text: string;
}

export interface SearchToken {
  value: string;
  start: number;
  end: number;
}

export interface SearchQuery {
  clauses: string[][];
}

export function isMySearchAnnotation(
  authorDid: string | null,
  accountDid: string | null,
): boolean {
  return (
    authorDid === null || (accountDid !== null && authorDid === accountDid)
  );
}

export function getAnnotatedVerseIds(
  annotations: readonly AnnotationRecord[],
  highlights: readonly HighlightRecord[],
  accountDid: string | null,
  order: 'oldest' | 'newest',
): VerseId[] {
  const dates = new Map<VerseId, number>();
  const add = (id: VerseId, createdAt: string) => {
    const time = Date.parse(createdAt);
    if (!Number.isFinite(time)) throw new Error('Invalid annotation date');
    const previous = dates.get(id);
    if (
      previous === undefined ||
      (order === 'oldest' ? time < previous : time > previous)
    ) {
      dates.set(id, time);
    }
  };
  for (const annotation of annotations) {
    if (isMySearchAnnotation(annotation.authorDid, accountDid)) {
      for (const id of annotation.verses) add(id, annotation.createdAt);
    }
  }
  for (const highlight of highlights) {
    if (
      isMySearchAnnotation(highlight.authorDid, accountDid) &&
      highlight.status !== 'deleting' &&
      highlight.status !== 'deleted'
    ) {
      add(highlight.verseId, highlight.createdAt);
    }
  }
  return [...dates.entries()]
    .sort(
      ([leftId, left], [rightId, right]) =>
        (order === 'oldest' ? left - right : right - left) ||
        leftId.localeCompare(rightId),
    )
    .map(([id]) => id);
}

export type BibleSearchBookFilter =
  'hebrew-bible' | 'new-testament' | 'gospels' | 'epistles';

export const bibleSearchBookFilters: readonly BibleSearchBookFilter[] = [
  'hebrew-bible',
  'new-testament',
  'gospels',
  'epistles',
];

const hebrewBibleBookIds = [
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
  'LJE',
  'S3Y',
  'SUS',
  'BEL',
  '1MA',
  '2MA',
  '3MA',
  '4MA',
  '1ES',
  '2ES',
  'MAN',
  'PS2',
] as const;

const newTestamentBookIds = [
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
] as const;

const gospelBookIds = ['MAT', 'MRK', 'LUK', 'JHN'] as const;

const epistleBookIds = [
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
] as const;

export function isBibleSearchBookFilter(
  value: string,
): value is BibleSearchBookFilter {
  return (bibleSearchBookFilters as readonly string[]).includes(value);
}

export function getBibleSearchBookIds(
  filter: BibleSearchBookFilter,
): readonly string[] {
  switch (filter) {
    case 'hebrew-bible':
      return hebrewBibleBookIds;
    case 'new-testament':
      return newTestamentBookIds;
    case 'gospels':
      return gospelBookIds;
    case 'epistles':
      return epistleBookIds;
  }
}

export function extractVerses(source: string, bookId: string): SearchVerse[] {
  const verses: SearchVerse[] = [];
  let chapter = 0;
  let current: SearchVerse | undefined;
  let previousLabel = '';
  const seen = new Set<VerseId>();

  function walk(nodes: USFMNode[], blocks = false) {
    for (const node of nodes) {
      if (node.type === 'text') {
        if (current) current.text += (blocks ? ' ' : '') + node.value;
        continue;
      }
      if (node.category === 'chapter') {
        chapter = Number(node.argument);
        if (!Number.isSafeInteger(chapter) || chapter < 1) {
          throw new AppError(
            AppError.Code.BadRequest,
            'Invalid chapter number',
          );
        }
        current = undefined;
        walk(node.children, true);
      } else if (node.category === 'verse') {
        const label = node.argument ?? '';
        const verse = parseVerseLabel(label);
        if (!chapter || verse === undefined) {
          throw new AppError(
            AppError.Code.BadRequest,
            `Unsupported verse: ${label}`,
          );
        }
        const id = formatVerseId(bookId, chapter, verse);
        if (
          current?.id === id &&
          /^\d+[a-z]$/.test(label) &&
          /^\d+[a-z]$/.test(previousLabel) &&
          label > previousLabel
        ) {
          current.text += ' ';
          current.label += `, ${label}`;
        } else {
          if (seen.has(id))
            throw new AppError(
              AppError.Code.BadRequest,
              `Duplicate verse: ${id}`,
            );
          current = { id, label, text: '' };
          verses.push(current);
          seen.add(id);
        }
        previousLabel = label;
        walk(node.children);
      } else if (
        ['paragraph', 'poetry', 'list', 'table', 'break'].includes(
          node.category,
        )
      ) {
        if (current) current.text += ' ';
        walk(node.children, true);
      } else if (
        (node.category === 'character' || node.category === 'word') &&
        !['ca', 'va'].includes(node.marker)
      ) {
        walk(node.children);
      }
    }
  }

  walk(parseUSFMCached(source).children, true);
  return verses.map((verse) => ({
    ...verse,
    text: verse.text.replace(/\s+/g, ' ').trim(),
  }));
}

export function tokenize(text: string, language?: string): SearchToken[] {
  const normalize = (value: string) => value.normalize('NFC').toLowerCase();
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(
      new Intl.Segmenter(language, { granularity: 'word' }).segment(text),
    )
      .filter((segment) => segment.isWordLike)
      .map((segment) => ({
        value: normalize(segment.segment),
        start: segment.index,
        end: segment.index + segment.segment.length,
      }));
  }
  return Array.from(
    text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu),
    (match) => ({
      value: normalize(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
}

export function parseSearchQuery(
  input: string,
  language?: string,
): SearchQuery {
  if (input.length > 256)
    throw new AppError(
      AppError.Code.BadRequest,
      'Search is limited to 256 characters',
    );
  if ((input.match(/"/g)?.length ?? 0) % 2)
    throw new AppError(AppError.Code.BadRequest, 'Close the quoted phrase');
  const clauses: string[][] = [];
  for (const match of input.matchAll(/"([^"]*)"|([^\s"]+)/g)) {
    const phrase = match.at(1);
    const words = tokenize(phrase ?? match[2], language).map(
      (token) => token.value,
    );
    if (phrase !== undefined) {
      if (words.length) clauses.push(words);
    } else {
      clauses.push(...words.map((word) => [word]));
    }
  }
  if (clauses.length > 32)
    throw new AppError(AppError.Code.BadRequest, 'Too many search terms');
  return { clauses };
}

export function matchesSearch(
  tokens: SearchToken[],
  query: SearchQuery,
): boolean {
  return (
    query.clauses.length > 0 &&
    query.clauses.every((clause) =>
      tokens.some((_, start) =>
        clause.every((word, offset) => tokens[start + offset]?.value === word),
      ),
    )
  );
}

export function searchRanges(
  tokens: SearchToken[],
  query: SearchQuery,
): [number, number][] {
  const ranges: [number, number][] = [];
  for (let start = 0; start < tokens.length; start++) {
    for (const clause of query.clauses) {
      if (
        clause.every((word, offset) => tokens[start + offset]?.value === word)
      ) {
        const end = tokens[start + clause.length - 1].end;
        const previous = ranges.at(-1);
        if (previous && previous[1] >= tokens[start].start)
          previous[1] = Math.max(previous[1], end);
        else ranges.push([tokens[start].start, end]);
      }
    }
  }
  return ranges;
}
