import { Box, Button, Icon, ScrollArea } from '@a-type/ui';
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AnnotationEditor } from '#/components/annotations/AnnotationEditor';
import { AnnotationView } from '#/components/annotations/AnnotationView';
import { VerseGutter } from '#/components/annotations/VerseGutter';
import { UserMenu } from '#/components/auth/UserMenu';
import { BibleLocationSelector } from '#/components/bible/BibleLocationSelector';
import type { VerseInteraction, VersePresentation } from '#/components/usfm';
import {
  BookIdProvider,
  USFMRenderer,
  VerseInteractionProvider,
  VersePresentationProvider,
} from '#/components/usfm';
import { listVisibleAnnotations } from '#/lib/annotations/indexeddb';
import { requestAnnotationSync } from '#/lib/annotations/sync';
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
import type { BookId, VerseId } from '#/lib/bible/verse';
import { formatVerseId, parseVerseId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import { userAccountQueryOptions } from '#/queries/user';
import cls from './$translation.$book.$chapter.module.css';

export const Route = createFileRoute('/$translation/$book/$chapter')({
  validateSearch: (search: Record<string, unknown>) => {
    const verse = parseVerseSelection(search.verses).at(0);
    const verses = verse ? formatVerseSelection([verse]) : undefined;
    const annotation =
      typeof search.annotation === 'string' && search.annotation
        ? search.annotation
        : undefined;
    return {
      ...(verses ? { verses } : {}),
      ...(annotation ? { annotation } : {}),
    };
  },
  loader: async ({ params, context }) => {
    const location = parseBibleLocation(params.book, params.chapter);
    if (!location || !isTranslationId(params.translation)) throw notFound();

    const manifest = await fetchTranslationManifest(params.translation);
    const book = getTranslationBook(manifest, location.bookId);
    if (!hasTranslationChapter(book, location.chapter)) throw notFound();

    const source = await fetchTranslationSource(params.translation, book);

    await context.queryClient.query({
      ...userAccountQueryOptions,
      staleTime: 'static',
    });

    return {
      location,
      manifest,
      source,
      translationId: params.translation,
    };
  },
  component: BibleReader,
});

function BibleReader() {
  const { location, manifest, source, translationId } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [addingVerses, setAddingVerses] = useState(false);
  const [draftVerses, setDraftVerses] = useState<readonly VerseId[]>([]);
  const selectedNumbers = parseVerseSelection(search.verses);
  const selectedNumber = selectedNumbers.at(0);
  const selectedVerse = selectedNumber
    ? formatVerseId(location.bookId, location.chapter, selectedNumber)
    : undefined;
  const selectedVerses = selectedVerse ? [selectedVerse] : [];
  const selectedSet = new Set(editorOpen ? draftVerses : selectedVerses);
  const { data: account } = useSuspenseQuery(userAccountQueryOptions);
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

  const closeEditor = () => {
    setEditorOpen(false);
    setAddingVerses(false);
    setDraftVerses([]);
  };

  const navigateTo = (bookId: BookId, chapter: number) => {
    closeEditor();
    navigate({
      to: '/$translation/$book/$chapter',
      params: {
        translation: translationId,
        book: bookId,
        chapter: String(chapter),
      },
      search: {},
    });
  };

  const setSelectedNumber = (verse?: number) =>
    navigate({
      search: {
        ...(verse ? { verses: formatVerseSelection([verse]) } : {}),
      },
      replace: true,
      resetScroll: false,
    });

  const setOpenAnnotation = (annotation?: string) =>
    navigate({
      search: {
        ...(search.verses ? { verses: search.verses } : {}),
        ...(annotation ? { annotation } : {}),
      },
      replace: true,
      resetScroll: false,
    });

  const interaction: VerseInteraction = {
    isSelected: (verseId) => selectedSet.has(verseId),
    toggle: (verseId) => {
      if (editorOpen) {
        if (!addingVerses) return;
        setDraftVerses((current) =>
          verseId === selectedVerse
            ? current
            : current.includes(verseId)
              ? current.length > 1
                ? current.filter((selected) => selected !== verseId)
                : current
              : [...current, verseId],
        );
        return;
      }

      const verse = parseVerseId(verseId).verse;
      void setSelectedNumber(selectedNumber === verse ? undefined : verse);
    },
  };

  const chapterAnnotations = (annotations.data ?? []).filter((annotation) => {
    const firstVerse = parseVerseId(annotation.verses[0]);
    return (
      firstVerse.bookId === location.bookId &&
      firstVerse.chapter === location.chapter
    );
  });
  const relatedAnnotations = selectedVerse
    ? chapterAnnotations.filter(
        (annotation) =>
          annotation.comment && annotation.verses.includes(selectedVerse),
      )
    : [];
  const openAnnotation =
    relatedAnnotations.find(
      (annotation) => annotation.id === search.annotation,
    ) ?? relatedAnnotations.at(0);
  const openAnnotationIndex = openAnnotation
    ? relatedAnnotations.indexOf(openAnnotation)
    : -1;

  const openEditor = () => {
    if (!selectedVerse) return;
    setDraftVerses([selectedVerse]);
    setAddingVerses(false);
    setEditorOpen(true);
  };

  useEffect(() => {
    const firstVerse = openAnnotation?.verses[0];
    if (!firstVerse) return;
    document.getElementById(`verse-${firstVerse}`)?.scrollIntoView({
      block: 'center',
    });
  }, [openAnnotation]);

  const annotatedNumbers = openAnnotation
    ? [
        ...new Set(
          openAnnotation.verses.map((verse) => parseVerseId(verse).verse),
        ),
      ].sort((left, right) => left - right)
    : [];
  const annotatedNumberSet = new Set(annotatedNumbers);
  const ownedHighlightColors = new Map(
    account
      ? chapterAnnotations.flatMap((annotation) =>
          !annotation.comment &&
          annotation.color &&
          annotation.ownerDid === account.did
            ? annotation.verses.map(
                (verseId) => [verseId, annotation.color] as const,
              )
            : [],
        )
      : [],
  );
  const presentation: VersePresentation = {
    active: Boolean(openAnnotation) && !editorOpen,
    isAnnotated: (verseId) =>
      !editorOpen && annotatedNumberSet.has(parseVerseId(verseId).verse),
    getHighlightColor: (verseId) => ownedHighlightColors.get(verseId),
  };

  return (
    <main className={cls.root}>
      <Box className={cls.pane}></Box>
      <Box className={cls.menubar}>
        <UserMenu />
      </Box>
      <BibleLocationSelector
        bookId={location.bookId}
        chapter={location.chapter}
        manifest={manifest}
        onBookChange={(bookId) => void navigateTo(bookId, 1)}
        onChapterChange={(chapter) => void navigateTo(location.bookId, chapter)}
        className={cls.location}
      />
      <Box surface elevated="md" className={cls.content}>
        <ScrollArea direction="vertical">
          <Box gap>
            <Box p className="min-w-0">
              <BookIdProvider bookId={location.bookId}>
                <VerseInteractionProvider value={interaction}>
                  <VersePresentationProvider value={presentation}>
                    <USFMRenderer usfm={source} chapter={location.chapter} />
                  </VersePresentationProvider>
                </VerseInteractionProvider>
              </BookIdProvider>
            </Box>
            <VerseGutter annotations={chapterAnnotations} />
          </Box>
        </ScrollArea>
      </Box>
      <aside
        className={cls.annotationPane}
        data-open={selectedVerse ? '' : undefined}
        data-editing={editorOpen ? '' : undefined}
        aria-hidden={!selectedVerse}
      >
        {editorOpen ? (
          <AnnotationEditor
            verses={draftVerses}
            addingVerses={addingVerses}
            onAddingVersesChange={setAddingVerses}
            onCancel={closeEditor}
            onSaved={async () => {
              await queryClient.invalidateQueries({
                queryKey: ['annotations'],
              });
              if (account) void requestAnnotationSync(account.did);
              closeEditor();
              await setSelectedNumber();
            }}
          />
        ) : openAnnotation ? (
          <AnnotationView
            key={openAnnotation.id}
            annotation={openAnnotation}
            onAdd={openEditor}
            onClose={() => void setSelectedNumber()}
            onPrevious={
              relatedAnnotations.length > 1
                ? () =>
                    void setOpenAnnotation(
                      relatedAnnotations[
                        (openAnnotationIndex - 1 + relatedAnnotations.length) %
                          relatedAnnotations.length
                      ].id,
                    )
                : undefined
            }
            onNext={
              relatedAnnotations.length > 1
                ? () =>
                    void setOpenAnnotation(
                      relatedAnnotations[
                        (openAnnotationIndex + 1) % relatedAnnotations.length
                      ].id,
                    )
                : undefined
            }
          />
        ) : selectedVerse ? (
          <Box className={cls.emptyAnnotation} p gap items="center">
            <Button onClick={openEditor}>{m.annotation_add()}</Button>
            <Button
              aria-label={m.annotation_close()}
              onClick={() => void setSelectedNumber()}
            >
              <Icon name="x" />
            </Button>
          </Box>
        ) : null}
      </aside>
    </main>
  );
}
