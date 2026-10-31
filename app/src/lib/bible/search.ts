import { parseUSFM } from '../../components/usfm/parser';
import type { USFMNode } from '../../components/usfm/types';
import { AppError } from '../error';
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

  walk(parseUSFM(source).children, true);
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
