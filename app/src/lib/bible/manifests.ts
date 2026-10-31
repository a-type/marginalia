import { AppError } from '../error';
import type { TranslationMetadata } from './fetch-bible';
import type { BookId } from './verse';

export const defaultTranslationId = 'eng_webu';

const webMetadata: TranslationMetadata = {
  language: 'eng',
  languageName: 'English',
  direction: 'ltr',
  attribution: 'Public domain',
  attributionUrl: 'https://worldenglish.bible/',
  licenses: [
    {
      name: 'Public domain',
      url: 'https://worldenglish.bible/',
      attributionRequired: false,
      shareAlike: false,
      noDerivatives: false,
    },
  ],
};

export interface BuiltInTranslation {
  id: string;
  title: string;
  description?: string;
  metadata: TranslationMetadata;
}

export const builtinTranslations: BuiltInTranslation[] = [
  {
    id: 'eng_webu',
    title: 'World English Bible (Updated)',
    description: `A contemporary English revision of the American Standard Version, completed in 2020. A good all-around Bible made freely available for the modern era.`,
    metadata: {
      language: 'eng',
      languageName: 'English',
      direction: 'ltr',
      attribution: 'Public domain',
      attributionUrl: 'https://worldenglish.bible/',
      licenses: [
        {
          name: 'Public domain',
          url: 'https://worldenglish.bible/',
          attributionRequired: false,
          shareAlike: false,
          noDerivatives: false,
        },
      ],
    },
  },
  {
    id: 'eng_msb',
    title: 'Majority Standard Bible',
    description: `This modern translation completed in 2022 is based on the Majority Text, and has some nice formatting features like cross-references and differentiated words of Jesus.`,
    metadata: {
      language: 'eng',
      languageName: 'English',
      direction: 'ltr',
      attribution: 'BSB Publishing, LLC',
      attributionUrl: 'https://majoritybible.com/',
      licenses: [
        {
          name: 'Public domain',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          attributionRequired: false,
          shareAlike: false,
          noDerivatives: false,
        },
      ],
    },
  },
  {
    id: 'eng_kjv',
    title: 'King James Version',
    description: `The definitive classic English translation of the Bible, first published in 1611. While its translation is less than accurate, it remains esteemed for its literary quality and historical significance.`,
    metadata: {
      language: 'eng',
      languageName: 'English',
      direction: 'ltr',
      licenses: [
        {
          name: 'Public domain',
          url: 'https://ebible.org/Scriptures/details.php?id=eng-kjv2006',
          attributionRequired: false,
          shareAlike: false,
          noDerivatives: false,
        },
      ],
      attribution: 'Public domain',
      attributionUrl:
        'https://ebible.org/Scriptures/details.php?id=eng-kjv2006',
    },
  },
];

const bookOrder = (
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH ' +
  'EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON ' +
  'MIC NAM HAB ZEP HAG ZEC MAL TOB JDT ESG WIS SIR BAR LJE S3Y SUS BEL 1MA ' +
  '2MA 3MA 4MA 1ES 2ES MAN PS2 ODA PSS EZA 5EZ 6EZ DAG PS3 2BA LBA JUB ' +
  'ENO 1MQ 2MQ 3MQ REP 4BA LAO ' +
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
  metadata?: TranslationMetadata;
}

export function getInitialTranslationBook(
  manifest: TranslationManifest,
): TranslationBook | undefined {
  return manifest.books.find((book) => book.id === 'GEN') ?? manifest.books[0];
}

export function isTranslationId(value: string): boolean {
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(value);
}

export function parseTranslationExtra(
  value: unknown,
  translationId: string,
  details?: Pick<TranslationManifest, 'title' | 'metadata'>,
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
  const books: TranslationBook[] = entries.map(([key, name]) => {
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
  const translation =
    details ?? builtinTranslations.find((entry) => entry.id === translationId);
  return {
    id: translationId,
    title: translation?.title ?? translationId,
    ...(translation?.metadata ? { metadata: translation.metadata } : {}),
    books,
  };
}
