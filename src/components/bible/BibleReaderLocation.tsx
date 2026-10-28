import { Button, clsx, Icon, Popover } from '@a-type/ui';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';

import type { TranslationManifest } from '#/lib/bible/source';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
  readRecentTranslations,
} from '#/lib/bible/source';
import type { BookId } from '#/lib/bible/verse';
import { parseVerseLabel } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import { TranslationManagerDialog } from '../settings/TranslationManagerDialog';
import { BibleLocationSelector } from './BibleLocationSelector';
import cls from './BibleReaderLocation.module.css';

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
  const [showTranslationManager, setShowTranslationManager] = useState(false);
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
  const recentTranslations = [
    { id: translationId, title: manifest.title },
    ...readRecentTranslations(),
  ]
    .filter(
      (translation, index, translations) =>
        translations.findIndex((entry) => entry.id === translation.id) ===
        index,
    )
    .slice(0, 3);

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
            <div
              className={cls.translationButtons}
              aria-label={m.translation_recent()}
            >
              {recentTranslations.map((translation) => (
                <Button
                  key={translation.id}
                  size="small"
                  emphasis="light"
                  toggled={translation.id === translationId}
                  toggleMode="color"
                  disabled={changeTranslation.isPending}
                  onClick={() => changeTranslation.mutate(translation.id)}
                >
                  {translation.title}
                </Button>
              ))}
              <Button
                size="small"
                emphasis="ghost"
                onClick={() => setShowTranslationManager(true)}
              >
                {m.translation_more()}
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover>
      <TranslationManagerDialog
        open={showTranslationManager}
        onOpenChange={setShowTranslationManager}
        onSelect={(translation) => {
          setShowTranslationManager(false);
          onOpenChange(false);
          changeTranslation.mutate(translation.id);
        }}
      />
      {announcement && (
        <p className={cls.status} role="status">
          {announcement}
        </p>
      )}
    </div>
  );
}
