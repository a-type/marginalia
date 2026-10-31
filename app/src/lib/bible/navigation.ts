import type { BibleLocation } from './location';
import type { TranslationManifest } from './source';

export function getAdjacentChapter(
  manifest: TranslationManifest,
  location: BibleLocation,
  direction: -1 | 1,
): BibleLocation | undefined {
  const bookIndex = manifest.books.findIndex(
    (book) => book.id === location.bookId,
  );
  if (bookIndex < 0) return undefined;
  const book = manifest.books.at(bookIndex);
  if (!book || location.chapter < 1 || location.chapter > book.chapters)
    return undefined;

  const chapter = location.chapter + direction;
  if (chapter >= 1 && chapter <= book.chapters)
    return { bookId: book.id, chapter };

  const adjacentIndex =
    (bookIndex + direction + manifest.books.length) % manifest.books.length;
  const adjacentBook = manifest.books.at(adjacentIndex);
  if (!adjacentBook) return undefined;
  return {
    bookId: adjacentBook.id,
    chapter: direction === 1 ? 1 : adjacentBook.chapters,
  };
}
