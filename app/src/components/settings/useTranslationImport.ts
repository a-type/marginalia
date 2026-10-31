import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { TranslationManifest } from '../../lib/bible/manifests';
import {
  importTranslation,
  previewTranslation,
  removeTranslation,
} from '../../lib/bible/translation-jobs';
import { requestPersistence } from './translationManagerUtils';

export function useTranslationImport() {
  const [draft, setDraft] = useState<{
    file: File;
    manifest: TranslationManifest;
  }>();
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
  const selectFile = (file?: File) => {
    setDraft(undefined);
    importJob.reset();
    if (file) preview.mutate(file);
  };
  const cancelImport = () => {
    if (draft && importJob.isPending)
      void removeTranslation(draft.manifest.id).catch(() => {});
    setDraft(undefined);
  };
  return { draft, setDraft, preview, importJob, selectFile, cancelImport };
}
