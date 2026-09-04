import { Box, Button, clsx, Icon } from '@a-type/ui';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';
import { useEffect } from 'react';

import { requestAnnotationSync } from '#/lib/annotations/sync';
import type { LocalAnnotation } from '#/lib/annotations/types';
import type { BookId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import { AnnotationEditor } from './AnnotationEditor';
import cls from './AnnotationPane.module.css';
import {
  annotationPaneStore,
  useOpenAnnotation,
  usePrimarySelectedVerseAnnotations,
  usePrimarySelectedVerseId,
  useSetOpenAnnotation,
  useSetSelectedVerseNumber,
} from './annotationPaneStore';
import { AnnotationView } from './AnnotationView';

export const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface UseAnnotationPaneOptions {
  accountDid: string | null;
  annotations: readonly LocalAnnotation[];
  bookId: BookId;
  chapter: number;
}

export interface AnnotationPaneProps {
  accountDid: string | null;
  className?: string;
}

export function AnnotationPane({ accountDid, className }: AnnotationPaneProps) {
  const queryClient = useQueryClient();
  const addingVerses = useSelector(
    annotationPaneStore,
    (state) => state.addingVerses,
  );
  const draftVerses = useSelector(
    annotationPaneStore,
    (state) => state.draftVerses,
  );
  const editing = useSelector(annotationPaneStore, (state) => state.editing);
  const selectedVerse = usePrimarySelectedVerseId();
  const openEditor = () => {
    if (selectedVerse) annotationPaneStore.actions.openEditor(selectedVerse);
  };

  const setOpenAnnotation = useSetOpenAnnotation();
  const handleOpenAnnotation = (annotationId?: string) => {
    setOpenAnnotation(annotationId);
  };

  const setSelectedNumber = useSetSelectedVerseNumber();
  const handleClose = () => {
    annotationPaneStore.actions.reset();
    setSelectedNumber();
  };

  const search = readerRoute.useSearch();
  const selectedVerseAnnotations = usePrimarySelectedVerseAnnotations();

  let openAnnotationIndex = selectedVerseAnnotations.findIndex(
    (annotation) => annotation.id === search.annotation,
  );
  if (openAnnotationIndex === -1) {
    openAnnotationIndex = 0;
  }
  const {
    current: openAnnotation,
    next: nextAnnotation,
    previous: previousAnnotation,
  } = useOpenAnnotation();

  // TODO: find a better place for this?
  useEffect(() => {
    const firstVerse = openAnnotation?.verses[0];
    if (!firstVerse) return;
    document.getElementById(`verse-${firstVerse}`)?.scrollIntoView({
      block: 'center',
    });
  }, [openAnnotation]);

  return (
    <aside
      className={clsx(cls.root, className)}
      data-open={selectedVerse ? '' : undefined}
      data-editing={editing ? '' : undefined}
      aria-hidden={!selectedVerse}
    >
      {editing ? (
        <AnnotationEditor
          verses={draftVerses}
          addingVerses={addingVerses}
          onAddingVersesChange={annotationPaneStore.actions.setAddingVerses}
          onCancel={annotationPaneStore.actions.reset}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ['annotations'] });
            if (accountDid) void requestAnnotationSync(accountDid);
            handleClose();
          }}
        />
      ) : openAnnotation ? (
        <AnnotationView
          key={openAnnotation.id}
          annotation={openAnnotation}
          onAdd={openEditor}
          onClose={handleClose}
          onPrevious={
            selectedVerseAnnotations.length > 1
              ? () => handleOpenAnnotation(previousAnnotation?.id)
              : undefined
          }
          onNext={
            selectedVerseAnnotations.length > 1
              ? () => handleOpenAnnotation(nextAnnotation?.id)
              : undefined
          }
        />
      ) : selectedVerse ? (
        <Box className={cls.empty} p gap items="center">
          <Button onClick={openEditor}>{m.annotation_add()}</Button>
          <Button aria-label={m.annotation_close()} onClick={handleClose}>
            <Icon name="x" />
          </Button>
        </Box>
      ) : null}
    </aside>
  );
}
