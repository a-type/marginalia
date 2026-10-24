import type { TranslationManifest } from '#/lib/bible/manifests';
import { knownTranslations } from '#/lib/bible/manifests';
import {
  downloadTranslation,
  importTranslation,
  previewTranslation,
  removeTranslation,
  stopTranslation,
} from '#/lib/bible/translation-jobs';
import type { StoredTranslation } from '#/lib/bible/translations';
import { listTranslations } from '#/lib/bible/translations';
import { m } from '#/paraglide/messages';
import { translationsQueryOptions } from '#/queries/translations';
import { Button, Dialog, Icon, Input } from '@a-type/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import cls from './TranslationManager.module.css';

function bytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function requestPersistence() {
  const storage = (navigator as Partial<Navigator>).storage;
  if (storage && typeof storage.persist === 'function') {
    void storage.persist().catch(() => false);
  }
}

export function translationStatus(record?: StoredTranslation) {
  if (!record) return m.translation_not_downloaded();
  if (record.sourceStatus === 'ready') return m.translation_downloaded();
  if (record.sourceStatus === 'paused') return m.translation_paused();
  if (record.sourceStatus === 'error') return m.translation_error();
  return m.translation_downloading();
}

export function TranslationManager() {
  const translations = useQuery(translationsQueryOptions);
  const quota = useQuery({
    queryKey: ['translation-quota', translations.dataUpdatedAt],
    queryFn: () => (navigator as Partial<Navigator>).storage?.estimate(),
    networkMode: 'always',
    enabled: typeof navigator !== 'undefined',
    gcTime: 0,
  });
  const [draft, setDraft] = useState<{
    file: File;
    manifest: TranslationManifest;
  }>();
  const [deleting, setDeleting] = useState<{ id: string; title: string }>();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();
  const preview = useMutation({
    networkMode: 'always',
    mutationFn: previewTranslation,
    onSuccess: (manifest, file) => setDraft({ file, manifest }),
  });
  const importJob = useMutation({
    networkMode: 'always',
    mutationFn: async (value: NonNullable<typeof draft>) => {
      requestPersistence();
      await importTranslation(
        value.file,
        value.manifest.title,
        value.manifest.id,
      );
    },
    onSuccess: () => setDraft(undefined),
  });
  const deletion = useMutation({
    networkMode: 'always',
    mutationFn: async (id: string) => {
      await removeTranslation(id);
      if (id.startsWith('local-') && pathname.split('/').includes(id)) {
        const next = (await listTranslations()).find(
          (record) => record.sourceStatus === 'ready',
        );
        if (next) {
          await navigate({
            to: '/$translation/$book/$chapter',
            params: {
              translation: next.id,
              book: next.manifest.books[0].id,
              chapter: '1',
            },
            search: {},
          });
        } else await navigate({ to: '/' });
      }
    },
    onSuccess: () => setDeleting(undefined),
  });
  const catalog = [
    ...knownTranslations,
    ...(translations.data ?? [])
      .filter((record) => record.origin === 'import')
      .map((record) => ({ id: record.id, title: record.manifest.title })),
  ];
  return (
    <section className={cls.root} aria-label={m.translations_title()}>
      <h2>{m.translations_title()}</h2>
      {translations.isError && (
        <p role="alert">{m.translation_storage_error()}</p>
      )}
      <ul className={cls.list}>
        {catalog.map((translation) => (
          <TranslationRow
            key={translation.id}
            translation={translation}
            record={translations.data?.find(
              (record) => record.id === translation.id,
            )}
            onDelete={() => setDeleting(translation)}
          />
        ))}
      </ul>
      {quota.data?.quota !== undefined && (
        <small>
          {m.translation_quota({
            used: bytes(quota.data.usage ?? 0),
            quota: bytes(quota.data.quota),
          })}
        </small>
      )}
      <label className={cls.file}>
        {m.translation_import_file()}
        <input
          type="file"
          accept=".zip,.usfm,.sfm"
          disabled={preview.isPending || importJob.isPending}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setDraft(undefined);
            importJob.reset();
            if (file) preview.mutate(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {preview.isPending && <p role="status">{m.translation_preview()}</p>}
      {preview.error && <p role="alert">{preview.error.message}</p>}
      {draft && (
        <form
          className={cls.importForm}
          onSubmit={(event) => {
            event.preventDefault();
            importJob.mutate(draft);
          }}
        >
          <label>
            {m.translation_name()}
            <Input
              value={draft.manifest.title}
              required
              maxLength={200}
              disabled={importJob.isPending}
              onValueChange={(title) =>
                setDraft({ ...draft, manifest: { ...draft.manifest, title } })
              }
            />
          </label>
          <p>
            {m.translation_books({ count: draft.manifest.books.length })}:{' '}
            {draft.manifest.books.map((book) => book.title).join(', ')}
          </p>
          <div className={cls.actions}>
            <Button
              type="submit"
              disabled={importJob.isPending || !draft.manifest.title.trim()}
            >
              <Icon name="upload" />
              {importJob.isPending
                ? m.translation_importing()
                : m.translation_import()}
            </Button>
            <Button
              type="button"
              emphasis="ghost"
              onClick={() => {
                if (importJob.isPending)
                  void removeTranslation(draft.manifest.id).catch(() => {});
                setDraft(undefined);
              }}
            >
              {m.annotation_cancel()}
            </Button>
          </div>
        </form>
      )}
      {importJob.error && <p role="alert">{importJob.error.message}</p>}
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <Dialog.Content>
          <Dialog.Title>
            {m.translation_delete_confirm({ title: deleting?.title ?? '' })}
          </Dialog.Title>
          <Dialog.Description>
            {deleting?.id.startsWith('local-')
              ? m.translation_delete_import()
              : deleting?.id === 'web'
                ? m.translation_delete_default()
                : m.translation_delete()}
          </Dialog.Description>
          {deletion.error && <p role="alert">{deletion.error.message}</p>}
          <Dialog.Actions>
            <Dialog.Close>{m.annotation_cancel()}</Dialog.Close>
            <Button
              disabled={deletion.isPending}
              onClick={() => {
                if (deleting) deletion.mutate(deleting.id);
              }}
            >
              <Icon name="trash" />
              {m.translation_delete()}
            </Button>
          </Dialog.Actions>
        </Dialog.Content>
      </Dialog>
    </section>
  );
}

function TranslationRow({
  translation,
  record,
  onDelete,
}: {
  translation: { id: string; title: string };
  record?: StoredTranslation;
  onDelete: () => void;
}) {
  const job = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      requestPersistence();
      await downloadTranslation(translation.id);
    },
  });
  const cancel = useMutation({
    networkMode: 'always',
    mutationFn: () => stopTranslation(translation.id),
  });
  const busy = Boolean(record?.owner && (record.leaseUntil ?? 0) > Date.now());
  const readingReady = record?.sourceStatus === 'ready';
  const preparing = readingReady && record.searchStatus !== 'ready';
  return (
    <li className={cls.row}>
      <div className={cls.details}>
        <h3>{translation.title}</h3>
        <span role="status">
          {translationStatus(record)}
          {readingReady &&
            ` · ${record.searchStatus === 'ready' ? m.translation_search_ready() : record.searchStatus === 'error' ? m.translation_search_error() : m.translation_preparing()}`}
        </span>
        {record && (
          <>
            <small>
              {m.translation_books({ count: record.manifest.books.length })}
            </small>
            <small>
              {m.translation_bytes({
                source: bytes(record.sourceBytes),
                search: bytes(record.preparedBytes),
              })}
            </small>
            {(!readingReady || preparing) && (
              <progress
                aria-label={
                  preparing
                    ? m.translation_preparing()
                    : m.translation_downloading()
                }
                value={preparing ? record.prepared : record.downloaded}
                max={record.manifest.books.length}
              />
            )}
          </>
        )}
        {(record?.error || job.error || cancel.error) && (
          <p role="alert">
            {record?.error || job.error?.message || cancel.error?.message}
          </p>
        )}
      </div>
      <div className={cls.actions}>
        {busy ? (
          <Button
            emphasis="ghost"
            size="small"
            title={m.annotation_cancel()}
            aria-label={m.annotation_cancel()}
            onClick={() => cancel.mutate()}
          >
            <Icon name="x" />
          </Button>
        ) : (
          (!readingReady || preparing) && (
            <Button
              size="small"
              disabled={job.isPending}
              onClick={() => job.mutate()}
            >
              <Icon name={record ? 'refresh' : 'download'} />
              {preparing
                ? m.translation_retry_search()
                : record
                  ? m.translation_resume()
                  : m.translation_download()}
            </Button>
          )
        )}
        {record && (
          <Button
            emphasis="ghost"
            size="small"
            title={m.translation_delete()}
            aria-label={m.translation_delete()}
            onClick={onDelete}
          >
            <Icon name="trash" />
          </Button>
        )}
      </div>
    </li>
  );
}
