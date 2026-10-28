import { m } from '#/paraglide/messages';
import { Button, Dialog, Icon, Input } from '@a-type/ui';
import { useState } from 'react';
import cls from './TranslationManager.module.css';
import { useTranslationImport } from './useTranslationImport';

export function TranslationImportForm() {
  const { draft, setDraft, preview, importJob, selectFile, cancelImport } =
    useTranslationImport();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        onClick={() => setOpen(true)}
        align="start"
        emphasis="light"
      >
        <Icon name="upload" />
        {m.translation_import()}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <Dialog.Content>
          <Dialog.Title>{m.translation_import()}</Dialog.Title>
          <label className={cls.fileButton}>
            <Icon name="upload" />
            {m.translation_import_file()}
            <input
              type="file"
              accept=".zip,.usfm,.sfm,.xml,.osis"
              disabled={preview.isPending || importJob.isPending}
              onChange={(event) => {
                selectFile(event.currentTarget.files?.[0]);
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
                    setDraft({
                      ...draft,
                      manifest: { ...draft.manifest, title },
                    })
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
                    cancelImport();
                    setOpen(false);
                  }}
                >
                  {m.annotation_cancel()}
                </Button>
              </div>
            </form>
          )}
          {importJob.error && <p role="alert">{importJob.error.message}</p>}
        </Dialog.Content>
      </Dialog>
    </>
  );
}
