import type { FetchBibleTranslation } from '#/lib/bible/fetch-bible';
import { filterFetchBibleTranslations } from '#/lib/bible/fetch-bible';
import { builtinTranslations } from '#/lib/bible/manifests';
import { m } from '#/paraglide/messages';
import {
  fetchBibleCatalogQueryOptions,
  translationsQueryOptions,
} from '#/queries/translations';
import { Box, Field, Input, ScrollArea, Select, Switch } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useDeferredValue, useId, useState } from 'react';
import { TranslationCard } from './TranslationCard';
import { TranslationDeletionDialog } from './TranslationDeletionDialog';
import { TranslationImportForm } from './TranslationImportForm';
import cls from './TranslationManager.module.css';
import { bytes, toFetchBibleTranslation } from './translationManagerUtils';
import { useTranslationDeletion } from './useTranslationDeletion';

export function TranslationManager({
  onSelect,
}: {
  onSelect?: (translation: FetchBibleTranslation) => void;
}) {
  const translations = useQuery(translationsQueryOptions);
  const catalog = useQuery(fetchBibleCatalogQueryOptions);
  const searchId = useId();
  const languageId = useId();
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('');
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const deferredText = useDeferredValue(text);
  const activeTranslationId = useRouterState({
    select: (state) => state.location.pathname.split('/')[1] ?? '',
  });
  const quota = useQuery({
    queryKey: ['translation-quota', translations.dataUpdatedAt],
    queryFn: () => (navigator as Partial<Navigator>).storage?.estimate(),
    networkMode: 'always',
    enabled: typeof navigator !== 'undefined',
    gcTime: 0,
  });
  const deletion = useTranslationDeletion();
  const records = translations.data ?? [];
  const recordById = new Map(records.map((record) => [record.id, record]));
  const remoteById = new Map(
    (catalog.data ?? []).map((entry) => [entry.id, entry]),
  );
  const allTranslations = [
    ...builtinTranslations.map((translation) =>
      toFetchBibleTranslation(translation, recordById.get(translation.id)),
    ),
    ...(catalog.data ?? []).map((translation) =>
      toFetchBibleTranslation(translation, recordById.get(translation.id)),
    ),
    ...records
      .filter(
        (record) =>
          !remoteById.has(record.id) &&
          !builtinTranslations.some(
            (translation) => translation.id === record.id,
          ),
      )
      .map((record) => toFetchBibleTranslation(record, record)),
  ]
    .filter(
      (translation, index, allEntries) =>
        allEntries.findIndex((entry) => entry.id === translation.id) === index,
    )
    .sort(
      (left, right) =>
        Number(recordById.get(right.id)?.sourceStatus === 'ready') -
        Number(recordById.get(left.id)?.sourceStatus === 'ready'),
    );
  const results = filterFetchBibleTranslations(
    allTranslations,
    deferredText,
    language,
  ).filter(
    (translation) =>
      !downloadedOnly ||
      recordById.get(translation.id)?.sourceStatus === 'ready',
  );
  const languages = [
    ...new Map(
      allTranslations
        .filter((translation) => translation.language)
        .map((translation) => [
          translation.language,
          `${translation.languageName} · ${translation.languageLocalName}`,
        ]),
    ).entries(),
  ];
  return (
    <div className={cls.root}>
      {(translations.isError || catalog.isError) && (
        <p role="alert">{m.translation_storage_error()}</p>
      )}
      <Box gap items="center" grow className={cls.filters}>
        <Field>
          <Field.Label>{m.translation_catalog_search()}</Field.Label>
          <Field.Control
            render={
              <Input
                id={searchId}
                type="search"
                value={text}
                onValueChange={setText}
              />
            }
          />
        </Field>
        <Field>
          <Field.Label>{m.language_label()}</Field.Label>
          <Field.Control
            render={
              <Select
                value={language}
                onValueChange={(value) => setLanguage(value ?? '')}
                itemToStringLabel={(value) =>
                  languages.find(([id]) => id === value)?.[1] ??
                  m.translation_all_languages()
                }
              >
                <Select.Trigger
                  id={languageId}
                  aria-label={m.translation_catalog_language()}
                  className={cls.languageTrigger}
                >
                  <span>
                    {languages.find(([id]) => id === language)?.[1] ??
                      m.translation_all_languages()}
                  </span>
                  <Select.Icon />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="">
                    {m.translation_all_languages()}
                  </Select.Item>
                  {languages.map(([id, name]) => (
                    <Select.Item value={id} key={id}>
                      {name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            }
          />
        </Field>
        <Field>
          <Field.Control
            render={
              <Switch
                checked={downloadedOnly}
                onCheckedChange={() => setDownloadedOnly(!downloadedOnly)}
              />
            }
          />
          <Field.Label>{m.translation_downloaded_only()}</Field.Label>
        </Field>
      </Box>
      <TranslationImportForm />
      <ScrollArea direction="vertical" className={cls.scrollArea}>
        <ScrollArea.Content>
          {catalog.status === 'pending' || translations.status === 'pending' ? (
            <p role="status">{m.translation_catalog_loading()}</p>
          ) : (
            <>
              <p role="status">
                {results.length
                  ? m.translation_catalog_count({ count: results.length })
                  : m.translation_catalog_empty()}
              </p>
              <ul className={cls.list}>
                {results.map((translation) => (
                  <TranslationCard
                    key={translation.id}
                    translation={translation}
                    record={recordById.get(translation.id)}
                    active={translation.id === activeTranslationId}
                    onSelect={onSelect}
                    onDelete={() => deletion.setDeleting(translation)}
                  />
                ))}
              </ul>
            </>
          )}
        </ScrollArea.Content>
      </ScrollArea>
      <small>
        {m.translation_quota({
          used: bytes(quota.data?.usage ?? 0),
          quota: bytes(quota.data?.quota ?? 0),
        })}
      </small>
      <TranslationDeletionDialog
        deleting={deletion.deleting}
        error={deletion.error}
        pending={deletion.pending}
        isDefault={deletion.isDefault}
        onClose={deletion.close}
        onConfirm={deletion.confirm}
      />
    </div>
  );
}
