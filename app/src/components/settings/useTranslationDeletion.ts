import { useMutation } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { defaultTranslationId } from '../../lib/bible/manifests';
import { removeTranslation } from '../../lib/bible/translation-jobs';
import { listTranslations } from '../../lib/bible/translations';

export function useTranslationDeletion() {
  const [deleting, setDeleting] = useState<{ id: string; title: string }>();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();
  const mutation = useMutation({
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
  return {
    deleting,
    setDeleting,
    error: mutation.error?.message,
    pending: mutation.isPending,
    close: () => setDeleting(undefined),
    confirm: () => {
      if (deleting) mutation.mutate(deleting.id);
    },
    isDefault: deleting?.id === defaultTranslationId,
  };
}
