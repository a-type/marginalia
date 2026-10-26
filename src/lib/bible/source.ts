import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';

import type { BookId } from '#/lib/bible/verse';
import { AppError } from '#/lib/error';
import type { TranslationBook, TranslationManifest } from './manifests';
import {
  defaultTranslationId,
  isTranslationId,
  knownTranslations,
  parseTranslationManifest,
} from './manifests';
import { getStoredBook, getTranslation } from './translations';

export { isTranslationId } from './manifests';
export type { TranslationBook, TranslationManifest } from './manifests';
const TRANSLATION_STORAGE_KEY = 'margins:translation';

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

function getTranslationUrl(translationId: string, path: string): string {
  if (
    !knownTranslations.some((translation) => translation.id === translationId)
  )
    throw new AppError(
      AppError.Code.NotFound,
      'Translation is not available on this device',
    );
  return new URL(`/usfm/${translationId}/${path}`, getResourceOrigin()).href;
}

export async function fetchTranslationManifest(
  translationId: string,
): Promise<TranslationManifest> {
  const local = await readLocalManifest(translationId);
  if (local) return local;
  const response = await fetch(
    getTranslationUrl(translationId, 'manifest.json'),
  );
  if (!response.ok)
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Unable to load translation manifest',
    );
  return parseTranslationManifest(await response.json(), translationId);
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
