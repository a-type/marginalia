import { getRouteApi } from '@tanstack/react-router';

import type { TranslationManifest } from '#/lib/bible/source';
import type { BookId } from '#/lib/bible/verse';
import { BibleLocationSelector } from './BibleLocationSelector';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface BibleReaderLocationProps {
  bookId: BookId;
  chapter: number;
  manifest: TranslationManifest;
  translationId: string;
  className?: string;
}

export function BibleReaderLocation({
  bookId,
  chapter,
  manifest,
  translationId,
  className,
}: BibleReaderLocationProps) {
  const navigate = readerRoute.useNavigate();

  const navigateTo = (nextBookId: BookId, nextChapter: number) =>
    navigate({
      params: {
        translation: translationId,
        book: nextBookId,
        chapter: String(nextChapter),
      },
      search: {},
    });

  return (
    <BibleLocationSelector
      bookId={bookId}
      chapter={chapter}
      manifest={manifest}
      onBookChange={(nextBookId) => void navigateTo(nextBookId, 1)}
      onChapterChange={(nextChapter) => void navigateTo(bookId, nextChapter)}
      className={className}
    />
  );
}
