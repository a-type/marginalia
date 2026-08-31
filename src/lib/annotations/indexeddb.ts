import { TID } from '@atproto/common-web';
import { deleteDB, openDB } from 'idb';

import { isValidVerseId, parseVerseId } from '#/lib/bible/verse';
import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  AnnotationSyncStatus,
  CreateAnnotationInput,
  LocalAnnotation,
  RemoteAnnotation,
} from './types';

const DATABASE_NAME = 'marginalia';
const DATABASE_VERSION = 1;
const ANONYMOUS_OWNER = '';

interface AnnotationDatabase extends DBSchema {
  annotations: {
    key: string;
    value: LocalAnnotation;
    indexes: {
      'by-owner': string;
      'by-owner-status': [string, AnnotationSyncStatus];
      'by-verse': string;
    };
  };
}

async function openAnnotationDatabase(): Promise<
  IDBPDatabase<AnnotationDatabase>
> {
  return openDB<AnnotationDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const annotations = database.createObjectStore('annotations', {
        keyPath: 'id',
      });
      annotations.createIndex('by-owner', 'ownerKey');
      annotations.createIndex('by-owner-status', ['ownerKey', 'syncStatus']);
      annotations.createIndex('by-verse', 'verses', { multiEntry: true });
    },
  });
}

function normalizeVerses(verses: readonly string[]): LocalAnnotation['verses'] {
  const uniqueVerses = [...new Set(verses)];
  if (uniqueVerses.length === 0 || !uniqueVerses.every(isValidVerseId)) {
    throw new Error('An annotation requires valid verses');
  }

  const first = parseVerseId(uniqueVerses[0]);
  if (
    !uniqueVerses.every((verseId) => {
      const verse = parseVerseId(verseId);
      return verse.bookId === first.bookId && verse.chapter === first.chapter;
    })
  ) {
    throw new Error('Annotation verses must belong to one chapter');
  }

  return uniqueVerses.sort(
    (left, right) => parseVerseId(left).verse - parseVerseId(right).verse,
  );
}

function normalizeComment(comment: string | undefined): string | undefined {
  const normalized = comment?.trim();
  return normalized || undefined;
}

async function closeAfter<T>(
  operation: (database: IDBPDatabase<AnnotationDatabase>) => Promise<T>,
): Promise<T> {
  const database = await openAnnotationDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

export async function createAnonymousAnnotation(
  input: CreateAnnotationInput,
): Promise<LocalAnnotation> {
  const comment = normalizeComment(input.comment);
  if (!comment && !input.color) {
    throw new Error('An annotation requires a comment or color');
  }

  const annotation: LocalAnnotation = {
    id: TID.nextStr(),
    verses: normalizeVerses(input.verses),
    ...(comment ? { comment } : {}),
    ...(input.color ? { color: input.color } : {}),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ownerDid: null,
    ownerKey: ANONYMOUS_OWNER,
    uri: null,
    cid: null,
    syncStatus: 'pending',
    syncError: null,
  };

  await closeAfter((database) => database.put('annotations', annotation));
  return annotation;
}

export async function listVisibleAnnotations(
  activeDid: string | null,
): Promise<LocalAnnotation[]> {
  return closeAfter(async (database) => {
    const anonymous = await database.getAllFromIndex(
      'annotations',
      'by-owner',
      ANONYMOUS_OWNER,
    );
    if (!activeDid) return anonymous;

    const owned = await database.getAllFromIndex(
      'annotations',
      'by-owner',
      activeDid,
    );
    return [...anonymous, ...owned];
  });
}

export async function listAnnotationsForVerse(
  verseId: string,
  activeDid: string | null,
): Promise<LocalAnnotation[]> {
  if (!isValidVerseId(verseId)) return [];
  return closeAfter(async (database) => {
    const annotations = await database.getAllFromIndex(
      'annotations',
      'by-verse',
      verseId,
    );
    return annotations.filter(
      (annotation) =>
        annotation.ownerDid === null || annotation.ownerDid === activeDid,
    );
  });
}

export async function claimAnonymousAnnotations(
  ownerDid: string,
): Promise<LocalAnnotation[]> {
  return closeAfter(async (database) => {
    const transaction = database.transaction('annotations', 'readwrite');
    const anonymous = await transaction.store
      .index('by-owner')
      .getAll(ANONYMOUS_OWNER);
    const claimed = anonymous.map((annotation) => ({
      ...annotation,
      ownerDid,
      ownerKey: ownerDid,
    }));
    await Promise.all(
      claimed.map((annotation) => transaction.store.put(annotation)),
    );
    await transaction.done;
    return claimed;
  });
}

export async function listPendingAnnotations(
  ownerDid: string,
): Promise<LocalAnnotation[]> {
  return closeAfter((database) =>
    database.getAllFromIndex('annotations', 'by-owner-status', [
      ownerDid,
      'pending',
    ]),
  );
}

export async function markAnnotationSynced(
  id: string,
  remote: { uri: string; cid: string | null },
): Promise<void> {
  await closeAfter(async (database) => {
    const annotation = await database.get('annotations', id);
    if (!annotation) return;
    await database.put('annotations', {
      ...annotation,
      ...remote,
      syncStatus: 'synced',
      syncError: null,
    });
  });
}

export async function markAnnotationSyncError(
  id: string,
  error: unknown,
): Promise<void> {
  await closeAfter(async (database) => {
    const annotation = await database.get('annotations', id);
    if (!annotation) return;
    await database.put('annotations', {
      ...annotation,
      syncError: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function reconcileRemoteAnnotations(
  ownerDid: string,
  remoteAnnotations: readonly RemoteAnnotation[],
): Promise<void> {
  await closeAfter(async (database) => {
    const transaction = database.transaction('annotations', 'readwrite');
    const existing = await transaction.store.index('by-owner').getAll(ownerDid);
    const remoteIds = new Set(
      remoteAnnotations.map((annotation) => annotation.rkey),
    );

    await Promise.all(
      existing
        .filter(
          (annotation) =>
            annotation.syncStatus === 'synced' && !remoteIds.has(annotation.id),
        )
        .map((annotation) => transaction.store.delete(annotation.id)),
    );

    await Promise.all(
      remoteAnnotations.map((remote) => {
        const comment = normalizeComment(remote.comment);
        const annotation: LocalAnnotation = {
          id: remote.rkey,
          verses: normalizeVerses(remote.verses),
          ...(comment ? { comment } : {}),
          ...(remote.color ? { color: remote.color } : {}),
          createdAt: remote.createdAt,
          ownerDid,
          ownerKey: ownerDid,
          uri: remote.uri,
          cid: remote.cid,
          syncStatus: 'synced',
          syncError: null,
        };
        return transaction.store.put(annotation);
      }),
    );
    await transaction.done;
  });
}

export async function deleteAnnotationDatabase(): Promise<void> {
  await deleteDB(DATABASE_NAME);
}
