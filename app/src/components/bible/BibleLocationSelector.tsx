import { Button, clsx, ScrollArea } from '@a-type/ui';
import { useState } from 'react';

import { m } from '#/paraglide/messages';
import type { TranslationManifest } from '../../lib/bible/source';
import type { BookId } from '../../lib/bible/verse';
import cls from './BibleLocationSelector.module.css';

export interface BibleLocationSelectorProps {
  bookId: BookId;
  chapter: number;
  manifest: TranslationManifest;
  onChapterChange: (bookId: BookId, chapter: number) => void;
  className?: string;
}

export function BibleLocationSelector({
  bookId,
  chapter,
  manifest,
  onChapterChange,
  className,
}: BibleLocationSelectorProps) {
  const [selectedBookId, setSelectedBookId] = useState(bookId);
  const book = manifest.books.find((option) => option.id === selectedBookId);
  const selectingCurrentBook = selectedBookId === bookId;

  return (
    <div className={clsx(cls.root, className)}>
      <section className={cls.group}>
        <h2 id="bible-book-label" className={cls.heading}>
          {m.bible_book_label()}
        </h2>
        <ScrollArea className={cls.bookScrollArea}>
          <ScrollArea.Content
            className={cls.bookGrid}
            role="group"
            aria-labelledby="bible-book-label"
          >
            {manifest.books.map((option) => (
              <Button
                key={option.id}
                className={cls.book}
                size="small"
                emphasis="light"
                aria-current={option.id === selectedBookId ? 'page' : undefined}
                toggled={option.id === selectedBookId}
                toggleMode="color"
                onClick={() => setSelectedBookId(option.id)}
              >
                {option.title}
              </Button>
            ))}
          </ScrollArea.Content>
        </ScrollArea>
      </section>
      {book && (
        <section className={cls.group}>
          <h2 id="bible-chapter-label" className={cls.heading}>
            {m.bible_chapter_label()}
          </h2>
          <ScrollArea className={cls.chapterScrollArea}>
            <ScrollArea.Content
              className={cls.chapterGrid}
              role="group"
              aria-labelledby="bible-chapter-label"
            >
              {Array.from({ length: book.chapters }, (_, index) => {
                const number = index + 1;
                const selected = selectingCurrentBook && number === chapter;
                return (
                  <Button
                    key={number}
                    className={cls.chapter}
                    size="small"
                    emphasis="light"
                    aria-current={selected ? 'page' : undefined}
                    toggled={selected}
                    toggleMode="color"
                    onClick={() => onChapterChange(selectedBookId, number)}
                  >
                    {number}
                  </Button>
                );
              })}
            </ScrollArea.Content>
          </ScrollArea>
        </section>
      )}
    </div>
  );
}
