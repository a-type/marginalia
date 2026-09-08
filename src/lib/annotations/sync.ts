import type { DbClient } from '@tanstack/react-db';

import * as Annotation from '#/lexicons/com/marginalia/annotation';
import {
  formatAnnotationVerseRecordId,
  getAnnotationCollections,
} from './collections';
import { uploadAnnotationFn } from './functions';

const activeSyncs = new WeakMap<DbClient, Promise<void>>();

async function synchronizeAnnotations(dbClient: DbClient, ownerDid: string) {
  if (!navigator.onLine) return;

  const collections = getAnnotationCollections(dbClient);
  await Promise.all([
    collections.annotations.preload(),
    collections.annotationVerses.preload(),
  ]);

  for (const annotation of [...collections.annotations.values()]) {
    if (annotation.authorDid !== null || annotation.status !== 'pending') {
      continue;
    }

    const claimedId = `at://${ownerDid}/${Annotation.$nsid}/${annotation.rkey}`;
    const verses = [...collections.annotationVerses.values()].filter(
      (annotationVerse) => annotationVerse.annotationId === annotation.id,
    );
    const transaction = dbClient.createTransaction({
      mutationFn: async ({ transaction: pendingTransaction }) => {
        collections.annotations.utils.acceptMutations(pendingTransaction);
        collections.annotationVerses.utils.acceptMutations(pendingTransaction);
      },
    });
    transaction.mutate(() => {
      collections.annotationVerses.delete(
        verses.map((annotationVerse) => annotationVerse.id),
      );
      collections.annotations.delete(annotation.id);
      collections.annotations.insert({
        ...annotation,
        id: claimedId,
        authorDid: ownerDid,
      });
      collections.annotationVerses.insert(
        verses.map((annotationVerse) => ({
          ...annotationVerse,
          id: formatAnnotationVerseRecordId(claimedId, annotationVerse.verseId),
          annotationId: claimedId,
        })),
      );
    });
    await transaction.isPersisted.promise;
  }

  const pending = [...collections.annotations.values()].filter(
    (annotation) =>
      annotation.authorDid === ownerDid && annotation.status === 'pending',
  );
  for (const annotation of pending) {
    const verses = [...collections.annotationVerses.values()]
      .filter(
        (annotationVerse) => annotationVerse.annotationId === annotation.id,
      )
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((annotationVerse) => annotationVerse.verseId);
    try {
      const remote = await uploadAnnotationFn({
        data: {
          rkey: annotation.rkey,
          verses,
          comment: annotation.comment,
          createdAt: annotation.createdAt,
        },
      });
      const transaction = collections.annotations.update(
        annotation.id,
        (draft) => {
          draft.uri = remote.uri;
          draft.cid = remote.cid;
          draft.status = 'uploaded';
          draft.syncError = null;
        },
      );
      await transaction.isPersisted.promise;
    } catch (error) {
      const transaction = collections.annotations.update(
        annotation.id,
        (draft) => {
          draft.syncError =
            error instanceof Error ? error.message : String(error);
        },
      );
      await transaction.isPersisted.promise;
    }
  }
}

export function requestAnnotationSync(
  dbClient: DbClient,
  ownerDid: string,
): Promise<void> {
  const activeSync = activeSyncs.get(dbClient);
  if (activeSync) return activeSync;

  const sync = synchronizeAnnotations(dbClient, ownerDid).finally(() => {
    activeSyncs.delete(dbClient);
  });
  activeSyncs.set(dbClient, sync);
  return sync;
}
