import { Box, Button, clsx, Icon } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import { requestAnnotationSync } from '#/lib/annotations/sync';
import { m } from '#/paraglide/messages';
import { AnnotationEditor } from './AnnotationEditor';
import cls from './AnnotationPane.module.css';
import {
  useAnnotationPaneActions,
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
  const actions = useAnnotationPaneActions();
  const selectedVerse = usePrimarySelectedVerseId();
  const openEditor = () => {
    if (selectedVerse) actions.openEditor(selectedVerse);
  };

  const setOpenAnnotation = useSetOpenAnnotation();
  const handleOpenAnnotation = (annotationId?: string) => {
    setOpenAnnotation(annotationId);
  };

  const setSelectedNumber = useSetSelectedVerseNumber();
  const handleClose = () => {
    actions.reset();
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
  const openAnnotationVerses = useAnnotationVerseIds(
    openAnnotation?.id ?? null,
  );

  // TODO: find a better place for this?
  useEffect(() => {
    const firstVerse = openAnnotationVerses.at(0);
    if (!firstVerse) return;
    document.getElementById(`verse-${firstVerse}`)?.scrollIntoView({
      block: 'center',
    });
  }, [openAnnotationVerses]);

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
          onAddingVersesChange={actions.setAddingVerses}
          onCancel={actions.reset}
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
