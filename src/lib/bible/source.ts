import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';

import type { BookId } from '#/lib/bible/verse';
import { isBookId } from '#/lib/bible/verse';

export const defaultTranslationId = 'web';
const TRANSLATION_STORAGE_KEY = 'apostil:translation';

const getResourceOrigin = createIsomorphicFn()
  .client(() => window.location.origin)
  .server(() => getRequestUrl().origin);

export interface TranslationBook {
  id: BookId;
  title: string;
  chapters: number;
  source: string;
}

export interface TranslationManifest {
  id: string;
  title: string;
  books: TranslationBook[];
}

function isTranslationBook(value: unknown): value is TranslationBook {
  if (!value || typeof value !== 'object') return false;
  const book = value as Record<string, unknown>;
  return (
    typeof book.id === 'string' &&
    isBookId(book.id) &&
    typeof book.title === 'string' &&
    Number.isInteger(book.chapters) &&
    Number(book.chapters) > 0 &&
    typeof book.source === 'string' &&
    !book.source.includes('/')
  );
}

function parseTranslationManifest(value: unknown): TranslationManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid translation manifest');
  }
  const manifest = value as Record<string, unknown>;
  if (
    typeof manifest.id !== 'string' ||
    typeof manifest.title !== 'string' ||
    !Array.isArray(manifest.books) ||
    !manifest.books.every(isTranslationBook)
  ) {
    throw new Error('Invalid translation manifest');
  }
  return manifest as unknown as TranslationManifest;
}

export function isTranslationId(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}

export function readStoredTranslationId(): string {
  const translationId = localStorage.getItem(TRANSLATION_STORAGE_KEY);
  return translationId && isTranslationId(translationId)
    ? translationId
    : defaultTranslationId;
}

export function storeTranslationId(translationId: string): void {
  if (!isTranslationId(translationId)) return;
  localStorage.setItem(TRANSLATION_STORAGE_KEY, translationId);
}

function getTranslationUrl(translationId: string, path: string): string {
  if (!isTranslationId(translationId))
    throw new Error('Invalid translation ID');
  return new URL(`/usfm/${translationId}/${path}`, getResourceOrigin()).href;
}

export async function fetchTranslationManifest(
  translationId: string,
): Promise<TranslationManifest> {
  const response = await fetch(
    getTranslationUrl(translationId, 'manifest.json'),
  );
  if (!response.ok) throw new Error('Unable to load translation manifest');
  return parseTranslationManifest(await response.json());
}

export function getTranslationBook(
  manifest: TranslationManifest,
  bookId: BookId,
): TranslationBook | undefined {
  return manifest.books.find((book) => book.id === bookId);
}

export function hasTranslationChapter(
  book: TranslationBook | undefined,
  chapter: number,
): book is TranslationBook {
  return Boolean(book && chapter >= 1 && chapter <= book.chapters);
}

export async function fetchTranslationSource(
  translationId: string,
  book: TranslationBook,
): Promise<string> {
  const response = await fetch(getTranslationUrl(translationId, book.source));
  if (!response.ok) throw new Error(`Unable to load ${book.title}`);
  return response.text();
}
