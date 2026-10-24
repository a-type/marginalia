import { createFileRoute, redirect } from '@tanstack/react-router';

import { BibleRecovery } from '#/components/bible/BibleRecovery';
import { readStoredBibleLocation } from '#/lib/bible/location';
import {
  defaultTranslationId,
  fetchTranslationManifest,
  readStoredTranslationId,
} from '#/lib/bible/source';
import { listTranslations } from '#/lib/bible/translations';

export const Route = createFileRoute('/')({
  ssr: false,
  loader: async () => {
    const location = readStoredBibleLocation();
    const stored = readStoredTranslationId();
    const available = await listTranslations().catch(() => []);
    const translation =
      stored.startsWith('local-') &&
      !available.some(
        (record) => record.id === stored && record.sourceStatus === 'ready',
      )
        ? (available.find((record) => record.sourceStatus === 'ready')?.id ??
          defaultTranslationId)
        : stored;
    const manifest = await fetchTranslationManifest(translation).catch(
      () => undefined,
    );
    if (!manifest) return;
    const book =
      manifest.books.find((item) => item.id === location.bookId) ??
      manifest.books[0];
    throw redirect({
      to: '/$translation/$book/$chapter',
      params: {
        translation,
        book: book.id,
        chapter: String(
          book.id === location.bookId
            ? Math.min(location.chapter, book.chapters)
            : 1,
        ),
      },
      replace: true,
    });
  },
  component: BibleRecovery,
  errorComponent: BibleRecovery,
});
