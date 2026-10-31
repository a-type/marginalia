import type { DbClient } from '@tanstack/react-db';

import type { BibleLocation } from '../bible/location';
import type { VerseId } from '../bible/verse';
import { parseVerseId } from '../bible/verse';
import type { ChapterAnnotationSnapshot } from './collections';
import {
  ensureAnnotationCollectionReady,
  getAnnotationChapterKeys,
  getAnnotationCollections,
} from './collections';

/**
 * Reconciles a remote chapter snapshot without replacing an annotation's verses
 * from other chapters.
 */
export async function reconcileChapterAnnotations(
  dbClient: DbClient,
  location: BibleLocation,
  snapshot: ChapterAnnotationSnapshot,
): Promise<void> {
  const { annotations } = getAnnotationCollections(dbClient);
  await ensureAnnotationCollectionReady(annotations);

  const remoteAnnotationIds = new Set(
    snapshot.annotations.map((annotation) => annotation.id),
  );
  const currentAnnotations = [...annotations.values()];

  const transaction = dbClient.createTransaction({
    mutationFn: async ({ transaction: pendingTransaction }) => {
      await annotations.utils.acceptMutations(pendingTransaction);
    },
  });

  transaction.mutate(() => {
    for (const annotation of snapshot.annotations) {
      const existing = annotations.get(annotation.id);
      const verses = existing
        ? replaceChapterVerses(existing.verses, annotation.verses, location)
        : annotation.verses;
      const merged = withVerseLocation({ ...annotation, verses });
      if (existing) {
        annotations.update(annotation.id, (draft) => {
          Object.assign(draft, merged);
        });
      } else {
        annotations.insert(merged);
      }
    }

    for (const existing of currentAnnotations) {
      if (
        existing.status !== 'synced' ||
        remoteAnnotationIds.has(existing.id) ||
        !existing.verses.some((verseId) => isInLocation(verseId, location))
      ) {
        continue;
      }
      const verses = replaceChapterVerses(existing.verses, [], location);
      if (verses.length === 0) {
        annotations.delete(existing.id);
      } else {
        annotations.update(existing.id, (draft) => {
          Object.assign(draft, withVerseLocation({ ...existing, verses }));
        });
      }
    }
  });

  await transaction.isPersisted.promise;
}

export async function cacheAnnotationSnapshot(
  dbClient: DbClient,
  snapshot: ChapterAnnotationSnapshot,
): Promise<void> {
  const { annotations } = getAnnotationCollections(dbClient);
  await ensureAnnotationCollectionReady(annotations);

  const transaction = dbClient.createTransaction({
    mutationFn: async ({ transaction: pendingTransaction }) => {
      await annotations.utils.acceptMutations(pendingTransaction);
    },
  });

  transaction.mutate(() => {
    upsertSnapshot(annotations, snapshot);
  });

  await transaction.isPersisted.promise;
}

function upsertSnapshot(
  annotations: ReturnType<typeof getAnnotationCollections>['annotations'],
  snapshot: ChapterAnnotationSnapshot,
) {
  for (const annotation of snapshot.annotations) {
    if (annotations.has(annotation.id)) {
      annotations.update(annotation.id, (draft) => {
        Object.assign(draft, annotation);
      });
    } else {
      annotations.insert(annotation);
    }
  }
}

function isInLocation(verseId: VerseId, location: BibleLocation) {
  const verse = parseVerseId(verseId);
  return verse.bookId === location.bookId && verse.chapter === location.chapter;
}

function replaceChapterVerses(
  existingVerses: readonly VerseId[],
  remoteVerses: readonly VerseId[],
  location: BibleLocation,
): VerseId[] {
  const replacement = [...remoteVerses];
  const merged: VerseId[] = [];
  let insertedReplacement = false;
  for (const verseId of existingVerses) {
    if (isInLocation(verseId, location)) {
      if (!insertedReplacement) {
        merged.push(...replacement);
        insertedReplacement = true;
      }
    } else {
      merged.push(verseId);
    }
  }
  if (!insertedReplacement) merged.push(...replacement);
  return [...new Set(merged)];
}

function withVerseLocation<T extends { verses: readonly VerseId[] }>(
  record: T,
) {
  const firstVerse = record.verses[0];
  const { bookId, chapter } = parseVerseId(firstVerse);
  return {
    ...record,
    bookId,
    chapter,
    chapterKeys: getAnnotationChapterKeys(record.verses),
  };
}
