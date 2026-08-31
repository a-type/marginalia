import { Box } from '@a-type/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AnnotationDialog } from '#/components/annotations/AnnotationDialog';
import { VerseGutter } from '#/components/annotations/VerseGutter';
import { AuthPanel } from '#/components/auth/AuthPanel';
import { BibleLocationSelector } from '#/components/bible/BibleLocationSelector';
import type { VerseInteraction } from '#/components/usfm';
import {
  BookIdProvider,
  USFMRenderer,
  VerseInteractionProvider,
} from '#/components/usfm';
import { listVisibleAnnotations } from '#/lib/annotations/indexeddb';
import { requestAnnotationSync } from '#/lib/annotations/sync';
import { getCurrentAccountFn } from '#/lib/auth/functions';
import { parseBibleLocation, storeBibleLocation } from '#/lib/bible/location';
import {
  formatVerseSelection,
  parseVerseSelection,
} from '#/lib/bible/selection';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
  getTranslationBook,
  hasTranslationChapter,
  isTranslationId,
  storeTranslationId,
} from '#/lib/bible/source';
import type { BookId } from '#/lib/bible/verse';
import { formatVerseId, parseVerseId } from '#/lib/bible/verse';
import cls from './index.module.css';

export const Route = createFileRoute('/$translation/$book/$chapter')({
  validateSearch: (search: Record<string, unknown>) => {
    const verses = formatVerseSelection(parseVerseSelection(search.verses));
    return verses ? { verses } : {};
  },
  loader: async ({ params }) => {
    const location = parseBibleLocation(params.book, params.chapter);
    if (!location || !isTranslationId(params.translation)) throw notFound();

    const manifest = await fetchTranslationManifest(params.translation);
    const book = getTranslationBook(manifest, location.bookId);
    if (!hasTranslationChapter(book, location.chapter)) throw notFound();

    const [account, source] = await Promise.all([
      getCurrentAccountFn(),
      fetchTranslationSource(params.translation, book),
    ]);

    return {
      account,
      location,
      manifest,
      source,
      translationId: params.translation,
    };
  },
  component: BibleReader,
});

function BibleReader() {
  const { account, location, manifest, source, translationId } =
    Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const selectedNumbers = parseVerseSelection(search.verses);
  const selectedVerses = selectedNumbers.map((verse) =>
    formatVerseId(location.bookId, location.chapter, verse),
  );
  const selectedSet = new Set(selectedVerses);
  const annotations = useQuery({
    queryKey: ['annotations', account?.did ?? null],
    queryFn: () => listVisibleAnnotations(account?.did ?? null),
    enabled: typeof window !== 'undefined',
  });

  useEffect(() => {
    storeBibleLocation(location);
    storeTranslationId(translationId);
  }, [location, translationId]);

  useEffect(() => {
    if (!account) return;
    const synchronize = () => {
      void requestAnnotationSync(account.did).finally(() =>
        queryClient.invalidateQueries({ queryKey: ['annotations'] }),
      );
    };
    synchronize();
    window.addEventListener('online', synchronize);
    return () => window.removeEventListener('online', synchronize);
  }, [account, queryClient]);

  const navigateTo = (bookId: BookId, chapter: number) =>
    navigate({
      to: '/$translation/$book/$chapter',
      params: {
        translation: translationId,
        book: bookId,
        chapter: String(chapter),
      },
      search: {},
    });

  const setSelectedNumbers = (verses: readonly number[]) =>
    navigate({
      search: verses.length ? { verses: formatVerseSelection(verses) } : {},
      replace: true,
    });

  const interaction: VerseInteraction = {
    isSelected: (verseId) => selectedSet.has(verseId),
    toggle: (verseId) => {
      const verse = parseVerseId(verseId).verse;
      setSelectedNumbers(
        selectedNumbers.includes(verse)
          ? selectedNumbers.filter((selected) => selected !== verse)
          : [...selectedNumbers, verse],
      );
    },
  };

  const chapterAnnotations = (annotations.data ?? []).filter((annotation) => {
    const firstVerse = parseVerseId(annotation.verses[0]);
    return (
      firstVerse.bookId === location.bookId &&
      firstVerse.chapter === location.chapter
    );
  });

  return (
    <main className={cls.root}>
      <Box className={cls.pane}>
        <BibleLocationSelector
          bookId={location.bookId}
          chapter={location.chapter}
          manifest={manifest}
          onBookChange={(bookId) => void navigateTo(bookId, 1)}
          onChapterChange={(chapter) =>
            void navigateTo(location.bookId, chapter)
          }
        />
        <AuthPanel account={account} />
      </Box>
      <Box surface elevated="md" className={cls.content}>
        <BookIdProvider bookId={location.bookId}>
          <VerseInteractionProvider value={interaction}>
            <USFMRenderer usfm={source} chapter={location.chapter} />
          </VerseInteractionProvider>
        </BookIdProvider>
        <VerseGutter
          selectedVerses={selectedVerses}
          annotations={chapterAnnotations}
          onAdd={() => setDialogOpen(true)}
          onClear={() => void setSelectedNumbers([])}
        />
        <AnnotationDialog
          open={dialogOpen}
          verses={selectedVerses}
          onOpenChange={setDialogOpen}
          onSaved={async () => {
            await queryClient.invalidateQueries({
              queryKey: ['annotations'],
            });
            if (account) void requestAnnotationSync(account.did);
            await setSelectedNumbers([]);
          }}
        />
      </Box>
    </main>
  );
}
