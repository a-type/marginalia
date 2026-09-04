import { Box, Button, Icon, ScrollArea } from '@a-type/ui';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AnnotationEditor } from '#/components/annotations/AnnotationEditor';
import { AnnotationView } from '#/components/annotations/AnnotationView';
import { VerseGutter } from '#/components/annotations/VerseGutter';
import type { VerseInteraction, VersePresentation } from '#/components/usfm';
import {
  BookIdProvider,
  USFMRenderer,
  VerseInteractionProvider,
  VersePresentationProvider,
} from '#/components/usfm';
import { requestAnnotationSync } from '#/lib/annotations/sync';
import type { LocalAnnotation } from '#/lib/annotations/types';
import type { BibleLocation } from '#/lib/bible/location';
import {
  formatVerseSelection,
  parseVerseSelection,
} from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';
import { formatVerseId, parseVerseId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import cls from './BibleReader.module.css';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface AnnotatedBibleChapterProps {
  accountDid: string | null;
  annotations: readonly LocalAnnotation[];
  location: BibleLocation;
  source: string;
}

export function AnnotatedBibleChapter({
  accountDid,
  annotations,
  location,
  source,
}: AnnotatedBibleChapterProps) {
  const search = readerRoute.useSearch();
  const navigate = readerRoute.useNavigate();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [addingVerses, setAddingVerses] = useState(false);
  const [draftVerses, setDraftVerses] = useState<readonly VerseId[]>([]);
  const selectedNumber = parseVerseSelection(search.verses).at(0);
  const selectedVerse = selectedNumber
    ? formatVerseId(location.bookId, location.chapter, selectedNumber)
    : undefined;
  const selectedVerses = selectedVerse ? [selectedVerse] : [];
  const selectedSet = new Set(editorOpen ? draftVerses : selectedVerses);

  const closeEditor = () => {
    setEditorOpen(false);
    setAddingVerses(false);
    setDraftVerses([]);
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

  const relatedAnnotations = selectedVerse
    ? annotations.filter(
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

  const annotatedNumberSet = new Set(
    openAnnotation?.verses.map((verse) => parseVerseId(verse).verse) ?? [],
  );
  const ownedHighlightColors = new Map(
    accountDid
      ? annotations.flatMap((annotation) =>
          !annotation.comment &&
          annotation.color &&
          annotation.ownerDid === accountDid
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
    <>
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
            <VerseGutter annotations={annotations} />
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
              if (accountDid) void requestAnnotationSync(accountDid);
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
    </>
  );
}
