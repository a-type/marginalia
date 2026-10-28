import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';

import type { BookId } from '#/lib/bible/verse';
import { AppError } from '#/lib/error';
import { fetchBibleManifest, translationResourceUrl } from './fetch-bible';
import type { TranslationBook, TranslationManifest } from './manifests';
import {
  builtinTranslations,
  defaultTranslationId,
  isTranslationId,
  parseTranslationExtra,
} from './manifests';
import { getStoredBook, getTranslation } from './translations';

export { isTranslationId } from './manifests';
export type { TranslationBook, TranslationManifest } from './manifests';
const TRANSLATION_STORAGE_KEY = 'margins:translation';
const RECENT_TRANSLATIONS_STORAGE_KEY = 'margins:recent-translations';
const MAX_RECENT_TRANSLATIONS = 3;

export interface RecentTranslation {
  id: string;
  title: string;
}

const getResourceOrigin = createIsomorphicFn()
  .client(() => window.location.origin)
  .server(() => getRequestUrl().origin);

const readLocalManifest = createIsomorphicFn()
  .client(async (id: string) => {
    try {
      const record = await getTranslation(id);
      return record &&
        (record.origin === 'remote' || record.sourceStatus === 'ready')
        ? record.manifest
        : undefined;
    } catch (error) {
      if (id.startsWith('local-')) throw AppError.wrap(error);
      return undefined;
    }
  })
  .server((_id: string): Promise<TranslationManifest | undefined> =>
    Promise.resolve(undefined),
  );

const readLocalSource = createIsomorphicFn()
  .client(async (id: string, bookId: string) => {
    try {
      return (await getStoredBook(id, bookId))?.source;
    } catch (error) {
      if (id.startsWith('local-')) throw AppError.wrap(error);
      return undefined;
    }
  })
  .server((_id: string, _bookId: string): Promise<string | undefined> =>
    Promise.resolve(undefined),
  );

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

export function readRecentTranslations(): RecentTranslation[] {
  try {
    const stored = JSON.parse(
      localStorage.getItem(RECENT_TRANSLATIONS_STORAGE_KEY) ?? '[]',
    ) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry): entry is RecentTranslation =>
        typeof entry === 'object' &&
        entry !== null &&
        isTranslationId(entry.id) &&
        typeof entry.title === 'string' &&
        entry.title.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function rememberTranslation(translation: RecentTranslation): void {
  if (!isTranslationId(translation.id) || !translation.title.trim()) return;
  const recent = readRecentTranslations().filter(
    (entry) => entry.id !== translation.id,
  );
  localStorage.setItem(
    RECENT_TRANSLATIONS_STORAGE_KEY,
    JSON.stringify([translation, ...recent].slice(0, MAX_RECENT_TRANSLATIONS)),
  );
}

function getTranslationUrl(translationId: string, path: string): string {
  return new URL(
    translationResourceUrl(translationId, path),
    getResourceOrigin(),
  ).href;
}

export async function fetchTranslationManifest(
  translationId: string,
): Promise<TranslationManifest> {
  const local = await readLocalManifest(translationId);
  if (local) return local;
  if (
    !builtinTranslations.some((translation) => translation.id === translationId)
  )
    return fetchBibleManifest(translationId);
  const response = await fetch(getTranslationUrl(translationId, 'extra.json'));
  if (!response.ok)
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Unable to load translation metadata',
    );
  return parseTranslationExtra(await response.json(), translationId);
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
  const local = await readLocalSource(translationId, book.id);
  if (local !== undefined) return local;
  if (!book.source)
    throw new AppError(
      AppError.Code.NotFound,
      'Book is not available on this device',
    );
  const response = await fetch(getTranslationUrl(translationId, book.source));
  if (!response.ok)
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `Unable to load ${book.title}`,
    );
  return response.text();
}
