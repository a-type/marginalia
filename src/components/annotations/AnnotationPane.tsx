import { Box, Button, clsx, Icon } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import { requestAnnotationSync } from '#/lib/annotations/sync';
import { m } from '#/paraglide/messages';
import { AnnotationEditor } from './AnnotationEditor';
import cls from './AnnotationPane.module.css';
import { annotationPaneActions } from './annotationPaneState';
import {
  useAnnotationPaneState,
  useAnnotationVerseIds,
  useOpenAnnotation,
  usePrimarySelectedVerseAnnotations,
  usePrimarySelectedVerseId,
  useSetOpenAnnotation,
  useSetSelectedVerseNumber,
} from './annotationPaneStore';
import { AnnotationView } from './AnnotationView';

export const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface AnnotationPaneProps {
  accountDid: string | null;
  className?: string;
}

export function AnnotationPane({ accountDid, className }: AnnotationPaneProps) {
  const dbClient = useDbClient();
  const { addingVerses, draftVerses, editing } = useAnnotationPaneState();
  const selectedVerse = usePrimarySelectedVerseId();
  const openEditor = () => {
    if (selectedVerse) annotationPaneActions.openEditor(selectedVerse);
  };

  const setOpenAnnotation = useSetOpenAnnotation();
  const handleOpenAnnotation = (annotationId?: string) => {
    setOpenAnnotation(annotationId);
  };

  const setSelectedNumber = useSetSelectedVerseNumber();
  const handleClose = () => {
    annotationPaneActions.reset();
    setSelectedNumber();
  };

  const selectedVerseAnnotations = usePrimarySelectedVerseAnnotations();
  const {
    current: openAnnotation,
    next: nextAnnotation,
    previous: previousAnnotation,
  } = useOpenAnnotation();
  const openAnnotationVerses = useAnnotationVerseIds(
    openAnnotation?.id ?? null,
  );
  const firstOpenAnnotationVerse = openAnnotationVerses.at(0);

  useEffect(() => {
    if (editing || openAnnotation || selectedVerseAnnotations.length === 0) {
      return;
    }
    setOpenAnnotation(selectedVerseAnnotations[0]?.id);
  }, [editing, openAnnotation, selectedVerseAnnotations, setOpenAnnotation]);

  // TODO: find a better place for this?
  useEffect(() => {
    if (!firstOpenAnnotationVerse) return;
    document
      .getElementById(`verse-${firstOpenAnnotationVerse}`)
      ?.scrollIntoView({
        block: 'center',
      });
  }, [firstOpenAnnotationVerse]);

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
          onAddingVersesChange={annotationPaneActions.setAddingVerses}
          onCancel={annotationPaneActions.reset}
          onSaved={() => {
            if (accountDid) void requestAnnotationSync(dbClient, accountDid);
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
