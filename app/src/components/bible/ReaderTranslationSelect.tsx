import { Select } from '@a-type/ui';
import { useState } from 'react';

import { m } from '#/paraglide/messages';
import { readRecentTranslations } from '../../lib/bible/source';
import type { BookId } from '../../lib/bible/verse';
import { TranslationManagerDialog } from '../settings/TranslationManagerDialog';
import cls from './ReaderTranslationSelect.module.css';
import { useSelectTranslation } from './useSelectTranslation';

const manageTranslationsOption = '__manage_translations__';

export function ReaderTranslationSelect({
  bookId,
  chapter,
  translationId,
  title,
}: {
  bookId: BookId;
  chapter: number;
  translationId: string;
  title: string;
}) {
  const [announcement, setAnnouncement] = useState('');
  const [showTranslationManager, setShowTranslationManager] = useState(false);
  const [open, setOpen] = useState(false);
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
  const recentTranslations = [
    { id: translationId, title },
    ...readRecentTranslations(),
  ]
    .filter(
      (translation, index, translations) =>
        translations.findIndex((entry) => entry.id === translation.id) ===
        index,
    )
    .slice(0, 3);
  const translationOptions = [
    ...recentTranslations.map((translation) => translation.id),
    manageTranslationsOption,
  ];
  const translationById = new Map(
    recentTranslations.map((translation) => [translation.id, translation]),
  );
  const translationShortId = (translationId.split(/[-_]/)[1] ?? translationId)
    .slice(0, 3)
    .toUpperCase();

  return (
    <>
      <Select
        items={translationOptions.map((id) => ({
          label: translationById.get(id)?.title ?? id,
          value: id,
        }))}
        modal={false}
        value={translationId}
        open={open}
        onOpenChange={setOpen}
        onValueChange={(value, eventDetails) => {
          if (!value) return;
          if (eventDetails.reason !== 'item-press') return;
          setOpen(false);
          if (value === manageTranslationsOption) {
            setShowTranslationManager(true);
            return;
          }
          if (translationById.has(value)) changeTranslation.mutate(value);
        }}
      >
        <Select.Trigger
          className={cls.input}
          placeholder={m.translation_label()}
          aria-label={m.translation_label()}
          emphasis="ghost"
        >
          {translationShortId}
        </Select.Trigger>
        <Select.Content sideOffset={8} align="end" className={cls.content}>
          {translationOptions.map((id) => (
            <Select.Item
              key={id}
              value={id}
              className={
                id === manageTranslationsOption ? cls.manageOption : cls.option
              }
              disabled={
                id !== manageTranslationsOption && changeTranslation.isPending
              }
            >
              {id === manageTranslationsOption
                ? m.translation_more()
                : (translationById.get(id)?.title ?? id)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      {changeTranslation.error && (
        <p className={cls.status} role="alert">
          {m.translation_unavailable()} {changeTranslation.error.message}
        </p>
      )}
      <TranslationManagerDialog
        open={showTranslationManager}
        onOpenChange={setShowTranslationManager}
        onSelect={(translation) => {
          setShowTranslationManager(false);
          setOpen(false);
          changeTranslation.mutate(translation.id);
        }}
      />
      {announcement && (
        <p className={cls.status} role="status">
          {announcement}
        </p>
      )}
    </>
  );
}
