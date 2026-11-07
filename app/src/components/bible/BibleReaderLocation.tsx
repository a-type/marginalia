import { clsx } from '@a-type/ui';
import { getRouteApi, useLocation } from '@tanstack/react-router';
import { startTransition, useOptimistic, useRef, useState } from 'react';

import type { TranslationManifest } from '../../lib/bible/source';
import type { BookId } from '../../lib/bible/verse';
import cls from './BibleReaderLocation.module.css';
import { BookAutocomplete } from './BookAutocomplete';
import { ChapterAutocomplete } from './ChapterAutocomplete';
import { ChapterNavigationButtons } from './ChapterNavigationButtons';
import { ReaderTranslationSelect } from './ReaderTranslationSelect';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface BibleReaderLocationProps {
  bookId: BookId;
  chapter: number;
  manifest: TranslationManifest;
  translationId: string;
  onCurrentRouteChapterChange: (bookId: BookId, chapter: number) => void;
  className?: string;
}

export function BibleReaderLocation({
  bookId,
  chapter,
  manifest,
  translationId,
  onCurrentRouteChapterChange,
  className,
}: BibleReaderLocationProps) {
  const navigate = readerRoute.useNavigate();
  const { location } = readerRoute.useLoaderData();
  const activeReadingTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  const [previousLocation, setPreviousLocation] = useState({ bookId, chapter });
  const [pendingBookId, setPendingBookId] = useState<BookId>();
  const [chapterOpen, setChapterOpen] = useState(false);
  const [chapterQuery, setChapterQuery] = useState('');
  const [optimisticLocation, setOptimisticLocation] = useOptimistic({
    bookId,
    chapter,
  });
  const selectorRef = useRef<HTMLDivElement>(null);

  if (
    previousLocation.bookId !== bookId ||
    previousLocation.chapter !== chapter
  ) {
    setPreviousLocation({ bookId, chapter });
    setPendingBookId(undefined);
    setChapterOpen(false);
    setChapterQuery('');
  }

  const selectedBookId = pendingBookId ?? optimisticLocation.bookId;
  const book = manifest.books.find((option) => option.id === selectedBookId);
  const selectedChapter =
    selectedBookId === optimisticLocation.bookId
      ? optimisticLocation.chapter
      : 1;

  const navigateTo = async (nextBookId: BookId, nextChapter: number) => {
    await navigate({
      params: {
        translation: translationId,
        book: nextBookId,
        chapter: String(nextChapter),
      },
      state: (previous) => ({
        ...previous,
        activeReadingTabId,
        readingPosition: undefined,
      }),
      search: {},
    });
    if (location.bookId === nextBookId && location.chapter === nextChapter)
      onCurrentRouteChapterChange(nextBookId, nextChapter);
  };

  return (
    <div className={clsx(cls.root, className)}>
      <div className={cls.location}>
        <div ref={selectorRef} className={cls.selector}>
          <BookAutocomplete
            key={`book/${bookId}/${chapter}`}
            bookId={selectedBookId}
            books={manifest.books}
            className={cls.bookSelect}
            onSelect={(nextBookId) => {
              setPendingBookId(nextBookId);
              setChapterQuery('');
              requestAnimationFrame(() => {
                selectorRef.current
                  ?.querySelector<HTMLInputElement>('input[type="number"]')
                  ?.focus();
                setChapterOpen(true);
              });
            }}
          />
          {book && (
            <>
              <div className={cls.divider} />
              <ChapterAutocomplete
                key={`chapter/${bookId}/${chapter}`}
                chapters={book.chapters}
                chapter={selectedChapter}
                className={cls.chapterSelect}
                open={chapterOpen}
                onOpenChange={setChapterOpen}
                query={chapterQuery}
                onQueryChange={setChapterQuery}
                onSelect={(nextChapter) => {
                  setChapterOpen(false);
                  setPendingBookId(undefined);
                  startTransition(async () => {
                    setOptimisticLocation({
                      bookId: selectedBookId,
                      chapter: nextChapter,
                    });
                    await navigateTo(selectedBookId, nextChapter);
                  });
                }}
              />
            </>
          )}
        </div>
        <div className={cls.divider} />
        <ChapterNavigationButtons
          goTo={(target) => void navigateTo(target.bookId, target.chapter)}
          active={{ bookId, chapter }}
          manifest={manifest}
          emphasis="ghost"
        />
      </div>
      <div className={cls.divider} />
      <ReaderTranslationSelect
        bookId={bookId}
        chapter={chapter}
        translationId={translationId}
        title={manifest.title}
      />
    </div>
  );
}
