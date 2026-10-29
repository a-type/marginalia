import { clsx } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import {
  getAnnotationCollections,
  type AnnotationRecord,
} from '#/lib/annotations/collections';
import { deleteAnnotation } from '#/lib/annotations/functions';
import { requestAnnotationSync } from '#/lib/annotations/sync';
import { requestHighlightSync } from '#/lib/highlights/sync';
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
import { useSelectedVerseIds } from './VerseSelection';

export const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface AnnotationPaneProps {
  accountDid: string | null;
  className?: string;
}

export function AnnotationPane({ accountDid, className }: AnnotationPaneProps) {
  const dbClient = useDbClient();
  const { addingVerses, draftVerses, editing } = useAnnotationPaneState();
  const selectedVerse = usePrimarySelectedVerseId();
  const selectedVerses = useSelectedVerseIds();
  const openEditor = () => {
    if (selectedVerse) annotationPaneActions.openEditor(selectedVerses);
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
  const deleteMutation = useMutation({
    networkMode: 'always',
    mutationFn: async (annotation: AnnotationRecord) => {
      if (!annotation.uri) throw new Error('Annotation URI is unavailable');
      await deleteAnnotation({ data: { uri: annotation.uri } });

      const { annotations } = getAnnotationCollections(dbClient);
      const transaction = dbClient.createTransaction({
        mutationFn: async ({ transaction: pendingTransaction }) => {
          await annotations.utils.acceptMutations(pendingTransaction);
        },
      });
      transaction.mutate(() => {
        annotations.delete(annotation.id);
      });
      await transaction.isPersisted.promise;
    },
    onSuccess: handleClose,
  });

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
      data-empty={selectedVerse && !editing && !openAnnotation ? '' : undefined}
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
            if (accountDid) void requestHighlightSync(dbClient, accountDid);
            handleClose();
          }}
        />
      ) : openAnnotation ? (
        <AnnotationView
          key={openAnnotation.id}
          annotation={openAnnotation}
          onAdd={openEditor}
          onClose={handleClose}
          onDelete={
            accountDid &&
            openAnnotation.authorDid === accountDid &&
            openAnnotation.uri
              ? () => deleteMutation.mutate(openAnnotation)
              : undefined
          }
          deletePending={
            deleteMutation.isPending &&
            deleteMutation.variables.id === openAnnotation.id
          }
          deleteError={
            deleteMutation.variables?.id === openAnnotation.id
              ? deleteMutation.error?.message
              : undefined
          }
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
      ) : null}
    </aside>
  );
}
