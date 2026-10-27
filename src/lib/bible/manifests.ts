import { AppError } from '#/lib/error';
import type { BookId } from './verse';

export const defaultTranslationId = 'eng_webu';

export const builtinTranslations = [
  { id: 'eng_webu', title: 'World English Bible (Updated)' },
  { id: 'eng_webc', title: 'World English Bible (Catholic)' },
  { id: 'eng_asv', title: 'American Standard Version' },
];

const bookOrder = (
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH ' +
  'EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON ' +
  'MIC NAM HAB ZEP HAG ZEC MAL TOB JDT ESG WIS SIR BAR LJE S3Y SUS BEL 1MA ' +
  '2MA 3MA 4MA 1ES 2ES MAN PS2 ODA PSS EZA 5EZ 6EZ DAG PS3 2BA LBA JUB ' +
  'ENO 1MQ 2MQ 3MQ REP 4BA LAO' +
  'MAT MRK LUK JHN ACT ROM 1CO 2CO GAL ' +
  'EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'
).split(' ');

export interface TranslationBook {
  id: BookId;
  title: string;
  chapters: number;
  source?: string;
}

export interface TranslationManifest {
  id: string;
  title: string;
  books: TranslationBook[];
}

export function isTranslationId(value: string): boolean {
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(value);
}

export function parseTranslationExtra(
  value: unknown,
  translationId: string,
): TranslationManifest {
  const extra = value as {
    book_names?: Record<string, { normal?: unknown } | null>;
    chapter_headings?: Record<string, unknown>;
  } | null;
  const names = extra?.book_names;
  const headings = extra?.chapter_headings;
  const invalid = () => {
    throw new AppError(
      AppError.Code.BadRequest,
      'Invalid translation metadata',
    );
  };
  if (
    !isTranslationId(translationId) ||
    !names ||
    typeof names !== 'object' ||
    Array.isArray(names) ||
    !headings ||
    typeof headings !== 'object' ||
    Array.isArray(headings)
  )
    return invalid();

  const entries = Object.entries(names);
  if (!entries.length || entries.length > 200) return invalid();
  const books = entries.map(([key, name]): TranslationBook => {
    const chapters = headings[key];
    if (
      !/^[a-z0-9]{3}$/.test(key) ||
      typeof name?.normal !== 'string' ||
      !name.normal.trim() ||
      !Array.isArray(chapters) ||
      chapters.length < 2 ||
      !chapters.every((heading) => typeof heading === 'string')
    )
      return invalid();
    return {
      id: key.toUpperCase(),
      title: name.normal,
      chapters: chapters.length - 1,
      source: `${key}.usfm`,
    };
  });
  const rank = (id: string) => {
    const index = bookOrder.indexOf(id);
    return index === -1 ? bookOrder.length : index;
  };
  books.sort((first, second) => rank(first.id) - rank(second.id));
  return {
    id: translationId,
    title:
      builtinTranslations.find(
        (translation) => translation.id === translationId,
      )?.title ?? translationId,
    books,
  };
}
