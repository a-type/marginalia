import { marginsbible } from '@marginsbible/atproto/lexicons';
import type { DbClient } from '@tanstack/react-db';
import {
  ensureAnnotationCollectionReady,
  getAnnotationCollections,
} from './collections';
import { listMyAnnotationsPage, uploadAnnotation } from './functions';
import { readAnnotationLastSeen, writeAnnotationLastSeen } from './indexeddb';
import { cacheAnnotationSnapshot } from './reconcile';

const activeSyncs = new WeakMap<DbClient, Promise<void>>();

async function synchronizeAnnotations(dbClient: DbClient, ownerDid: string) {
  if (!navigator.onLine) return;

  const collections = getAnnotationCollections(dbClient);
  await ensureAnnotationCollectionReady(collections.annotations);
  await collections.annotations.utils.loadAll();

  for (const annotation of [...collections.annotations.values()]) {
    if (annotation.authorDid !== null || annotation.status !== 'pending') {
      continue;
    }

    const claimedId = `at://${ownerDid}/${marginsbible.annotation.$nsid}/${annotation.rkey}`;
    const transaction = dbClient.createTransaction({
      mutationFn: async ({ transaction: pendingTransaction }) => {
        await collections.annotations.utils.acceptMutations(pendingTransaction);
      },
    });
    transaction.mutate(() => {
      collections.annotations.delete(annotation.id);
      collections.annotations.insert({
        ...annotation,
        id: claimedId,
        authorDid: ownerDid,
      });
    });
    await transaction.isPersisted.promise;
  }

  const pending = [...collections.annotations.values()].filter(
    (annotation) =>
      annotation.authorDid === ownerDid && annotation.status === 'pending',
  );
  for (const annotation of pending) {
    try {
      const remote = await uploadAnnotation({
        data: {
          rkey: annotation.rkey,
          verses: annotation.verses,
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

  await pullAnnotations(dbClient, ownerDid);
}

async function pullAnnotations(dbClient: DbClient, ownerDid: string) {
  const lastSeen = await readAnnotationLastSeen(ownerDid);
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let newestAnnotationId: string | null = null;

  do {
    const page = await listMyAnnotationsPage({ data: { cursor } });
    const annotationIds = page.annotations.map((annotation) => annotation.id);
    if (newestAnnotationId === null && annotationIds.length > 0) {
      newestAnnotationId = annotationIds[0];
    }

    const lastSeenIndex = lastSeen ? annotationIds.indexOf(lastSeen) : -1;
    const annotations =
      lastSeenIndex >= 0
        ? page.annotations.slice(0, lastSeenIndex + 1)
        : page.annotations;
    if (annotations.length > 0) {
      await cacheAnnotationSnapshot(dbClient, { annotations });
    }

    if (lastSeenIndex >= 0 || !page.cursor) {
      cursor = undefined;
    } else {
      if (seenCursors.has(page.cursor)) {
        throw new Error('HappyView returned a repeated annotation cursor');
      }
      seenCursors.add(page.cursor);
      cursor = page.cursor;
    }
  } while (cursor);

  if (newestAnnotationId !== null) {
    await writeAnnotationLastSeen(ownerDid, newestAnnotationId);
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
