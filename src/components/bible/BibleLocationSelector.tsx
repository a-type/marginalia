import { clsx, Select } from '@a-type/ui';

import type { TranslationManifest } from '#/lib/bible/source';
import type { BookId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import cls from './BibleLocationSelector.module.css';

export interface BibleLocationSelectorProps {
  bookId: BookId;
  chapter: number;
  manifest: TranslationManifest;
  onBookChange: (bookId: BookId) => void;
  onChapterChange: (chapter: number) => void;
  className?: string;
}

export function BibleLocationSelector({
  bookId,
  chapter,
  manifest,
  onBookChange,
  onChapterChange,
  className,
}: BibleLocationSelectorProps) {
  const book = manifest.books.find((option) => option.id === bookId);

  return (
    <div className={clsx(cls.root, className)}>
      <Select
        value={bookId}
        onValueChange={(v) => {
          if (!v) return;
          onBookChange(v);
        }}
      >
        <Select.Trigger aria-label={m.bible_book_label()}>
          {book?.title ?? bookId}
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {manifest.books.map((option) => (
            <Select.Item key={option.id} value={option.id}>
              {option.title}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      {book && (
        <Select
          value={String(chapter)}
          onValueChange={(value) => onChapterChange(Number(value))}
        >
          <Select.Trigger aria-label={m.bible_chapter_label()} />
          <Select.Content>
            {Array.from({ length: book.chapters }, (_, index) => {
              const value = String(index + 1);
              return (
                <Select.Item key={value} value={value}>
                  {value}
                </Select.Item>
              );
            })}
          </Select.Content>
        </Select>
      )}
    </div>
  );
}
