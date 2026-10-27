import { Button, clsx, Icon, Popover } from '@a-type/ui';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';

import type { TranslationManifest } from '#/lib/bible/source';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
} from '#/lib/bible/source';
import type { BookId } from '#/lib/bible/verse';
import { parseVerseLabel } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import { BibleLocationSelector } from './BibleLocationSelector';
import cls from './BibleReaderLocation.module.css';
import { TranslationSelect } from './TranslationSelect';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface BibleReaderLocationProps {
  bookId: BookId;
  chapter: number;
  manifest: TranslationManifest;
  translationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function BibleReaderLocation({
  bookId,
  chapter,
  manifest,
  translationId,
  open,
  onOpenChange,
  className,
}: BibleReaderLocationProps) {
  const navigate = readerRoute.useNavigate();
  const search = readerRoute.useSearch();
  const [announcement, setAnnouncement] = useState('');
  const changeTranslation = useMutation({
    networkMode: 'always',
    mutationFn: async (translation: string) => {
      const next = await fetchTranslationManifest(translation);
      const sameBook = next.books.find((book) => book.id === bookId);
      const book = sameBook ?? next.books[0];
      const nextChapter = sameBook ? Math.min(chapter, book.chapters) : 1;
      const source = await fetchTranslationSource(translation, book);
      let selectedExists = false;
      let sourceChapter = 0;
      for (const match of source.matchAll(/^\\(c|v)\s+(\S+)/gm)) {
        if (match[1] === 'c') sourceChapter = Number(match[2]);
        else if (
          sourceChapter === nextChapter &&
          String(parseVerseLabel(match[2])) === search.verses
        )
          selectedExists = true;
      }
      await navigate({
        params: { translation, book: book.id, chapter: String(nextChapter) },
        search:
          selectedExists && book.id === bookId && nextChapter === chapter
            ? { verses: search.verses }
            : {},
      });
      setAnnouncement(
        book.id !== bookId || nextChapter !== chapter
          ? m.translation_location_changed()
          : '',
      );
    },
  });

  const navigateTo = async (nextBookId: BookId, nextChapter: number) => {
    await navigate({
      params: {
        translation: translationId,
        book: nextBookId,
        chapter: String(nextChapter),
      },
      search: {},
    });
    onOpenChange(false);
  };

  const currentBookTitle =
    manifest.books.find((book) => book.id === bookId)?.title ?? bookId;

  return (
    <div className={clsx(cls.root, className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger
          render={<Button className={cls.trigger} emphasis="default" />}
          aria-label={`${currentBookTitle}, ${m.bible_chapter_label()} ${chapter}`}
        >
          <span>
            {currentBookTitle} {chapter}
          </span>
          <Icon name="chevron" />
        </Popover.Trigger>
        <Popover.Content className={cls.content} side="bottom" align="start">
          <BibleLocationSelector
            bookId={bookId}
            chapter={chapter}
            manifest={manifest}
            onChapterChange={(nextBookId, nextChapter) =>
              void navigateTo(nextBookId, nextChapter)
            }
          />
          {changeTranslation.error && (
            <p className={cls.status} role="alert">
              {m.translation_unavailable()} {changeTranslation.error.message}
            </p>
          )}
          <div className={cls.translation}>
            <TranslationSelect
              value={translationId}
              onValueChange={(id) => changeTranslation.mutate(id)}
              loading={changeTranslation.isPending}
            />
          </div>
        </Popover.Content>
      </Popover>
      {announcement && (
        <p className={cls.status} role="status">
          {announcement}
        </p>
      )}
    </div>
  );
}
