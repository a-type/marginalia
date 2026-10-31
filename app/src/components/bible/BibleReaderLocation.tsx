import { Button, clsx, Icon, Popover } from '@a-type/ui';
import { getRouteApi, useLocation } from '@tanstack/react-router';
import { useState } from 'react';

import { m } from '#/paraglide/messages';
import type { TranslationManifest } from '../../lib/bible/source';
import { readRecentTranslations } from '../../lib/bible/source';
import type { BookId } from '../../lib/bible/verse';
import { TranslationManagerDialog } from '../settings/TranslationManagerDialog';
import { BibleLocationSelector } from './BibleLocationSelector';
import cls from './BibleReaderLocation.module.css';
import { useSelectTranslation } from './useSelectTranslation';

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
  const activeReadingTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  const [announcement, setAnnouncement] = useState('');
  const [showTranslationManager, setShowTranslationManager] = useState(false);
  const changeTranslation = useSelectTranslation({
    bookId,
    chapter,
    onChange({ book, chapter: nextChapter }) {
      setAnnouncement(
        book !== bookId || nextChapter !== chapter
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
      state: (previous) => ({ ...previous, activeReadingTabId }),
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

  const translationShortId = translationId.split(/[-_]/)[1].toUpperCase();

  return (
    <div className={clsx(cls.root, className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger
          render={<Button className={cls.trigger} emphasis="default" />}
          aria-label={`${currentBookTitle}, ${m.bible_chapter_label()} ${chapter}`}
        >
          <span>
            {currentBookTitle} {chapter} ({translationShortId})
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
