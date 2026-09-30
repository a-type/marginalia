import type { DbClient } from '@tanstack/react-db';

import type { BibleLocation } from '#/lib/bible/location';
import { getAnnotationCollections } from './collections';
import type { ChapterAnnotationSnapshot } from './collections';

/**
 * Reconciles an authoritative remote chapter snapshot into the local annotation
 * collections. Synced rows missing from the snapshot are removed only within
 * the requested chapter, while pending or uploaded local annotations and their
 * verse links are preserved. All collection changes are persisted atomically.
 */
export async function reconcileChapterAnnotations(
  dbClient: DbClient,
  location: BibleLocation,
  snapshot: ChapterAnnotationSnapshot,
): Promise<void> {
  const { annotations, annotationVerses } = getAnnotationCollections(dbClient);
  await Promise.all([annotations.preload(), annotationVerses.preload()]);

  const remoteAnnotationIds = new Set(
    snapshot.annotations.map((annotation) => annotation.id),
  );
  const remoteVerseIds = new Set(
    snapshot.annotationVerses.map((annotationVerse) => annotationVerse.id),
  );
  const pendingAnnotationIds = new Set(
    [...annotations.values()]
      .filter((annotation) => annotation.status !== 'synced')
      .map((annotation) => annotation.id),
  );

  const staleAnnotationIds = [...annotations.values()]
    .filter(
      (annotation) =>
        annotation.bookId === location.bookId &&
        annotation.chapter === location.chapter &&
        annotation.status === 'synced' &&
        !remoteAnnotationIds.has(annotation.id),
    )
    .map((annotation) => annotation.id);

  const staleVerseIds = [...annotationVerses.values()]
    .filter(
      (annotationVerse) =>
        annotationVerse.bookId === location.bookId &&
        annotationVerse.chapter === location.chapter &&
        !pendingAnnotationIds.has(annotationVerse.annotationId) &&
        !remoteVerseIds.has(annotationVerse.id),
    )
    .map((annotationVerse) => annotationVerse.id);

  const transaction = dbClient.createTransaction({
    mutationFn: async ({ transaction: pendingTransaction }) => {
      annotations.utils.acceptMutations(pendingTransaction);
      annotationVerses.utils.acceptMutations(pendingTransaction);
    },
  });

  transaction.mutate(() => {
    if (staleVerseIds.length > 0) annotationVerses.delete(staleVerseIds);
    if (staleAnnotationIds.length > 0) annotations.delete(staleAnnotationIds);

    for (const annotation of snapshot.annotations) {
      if (annotations.has(annotation.id)) {
        annotations.update(annotation.id, (draft) => {
          Object.assign(draft, annotation);
        });
      } else {
        annotations.insert(annotation);
      }
    }

    for (const annotationVerse of snapshot.annotationVerses) {
      if (annotationVerses.has(annotationVerse.id)) {
        annotationVerses.update(annotationVerse.id, (draft) => {
          Object.assign(draft, annotationVerse);
        });
      } else {
        annotationVerses.insert(annotationVerse);
      }
    }
  });

  await transaction.isPersisted.promise;
}
