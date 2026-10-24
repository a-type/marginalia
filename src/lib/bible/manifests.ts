import { AppError } from '#/lib/error';
import type { BookId } from './verse';
import { isBookId } from './verse';

export const defaultTranslationId = 'web';
export const knownTranslations = [
  { id: 'web', title: 'World English Bible (Catholic)' },
  { id: 'net', title: 'New English Translation' },
];

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
  return /^[a-z0-9-]+$/.test(value);
}

export function parseTranslationManifest(
  value: unknown,
  expectedId: string,
): TranslationManifest {
  const manifest = value as TranslationManifest | null;
  if (
    !manifest ||
    manifest.id !== expectedId ||
    !isTranslationId(manifest.id) ||
    typeof manifest.title !== 'string' ||
    !manifest.title.trim() ||
    !Array.isArray(manifest.books) ||
    !manifest.books.length ||
    manifest.books.length > 200 ||
    !manifest.books.every(
      (book: TranslationBook | null) =>
        book &&
        typeof book.id === 'string' &&
        isBookId(book.id) &&
        typeof book.title === 'string' &&
        Number.isSafeInteger(book.chapters) &&
        book.chapters > 0 &&
        typeof book.source === 'string' &&
        /^[\w.-]+$/.test(book.source) &&
        !book.source.includes('..'),
    ) ||
    new Set(manifest.books.map((book) => book.id)).size !==
      manifest.books.length
  ) {
    throw new AppError(
      AppError.Code.BadRequest,
      'Invalid translation manifest',
    );
  }
  return manifest;
}
