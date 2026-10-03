import { DbClient } from '@tanstack/react-db';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  AnnotationRecord,
  AnnotationVerseRecord,
  ChapterAnnotationSnapshot,
} from './collections';
import {
  formatAnnotationVerseRecordId,
  getAnnotationCollections,
} from './collections';
import { reconcileChapterAnnotations } from './reconcile';

const clients: DbClient[] = [];

function annotation(
  id: string,
  status: AnnotationRecord['status'],
): AnnotationRecord {
  return {
    id,
    rkey: id.split('/').at(-1) ?? id,
    uri: id.startsWith('at://') ? id : null,
    cid: null,
    authorDid: id.startsWith('at://') ? 'did:plc:author' : null,
    bookId: 'GEN',
    chapter: 1,
    comment: id,
    createdAt: '2026-09-04T00:00:00.000Z',
    status,
    syncError: null,
  };
}

function annotationVerse(
  annotationId: string,
  verse: number,
): AnnotationVerseRecord {
  const verseId = `GEN/1:${verse}` as const;
  return {
    id: formatAnnotationVerseRecordId(annotationId, verseId),
    annotationId,
    verseId,
    bookId: 'GEN',
    chapter: 1,
    verse,
    ordinal: 0,
  };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.cleanup()));
});

describe('reconcileChapterAnnotations', () => {
  it('replaces synced chapter rows while preserving pending local rows', async () => {
    const dbClient = new DbClient();
    clients.push(dbClient);
    const collections = getAnnotationCollections(dbClient);
    await Promise.all([
      collections.annotations.preload(),
      collections.annotationVerses.preload(),
    ]);

    const stale = annotation(
      'at://did:plc:old/com.apostilbible.annotation/old',
      'synced',
    );
    const pending = annotation('local:pending', 'pending');
    await Promise.all([
      collections.annotations.insert([stale, pending]).isPersisted.promise,
      collections.annotationVerses.insert([
        annotationVerse(stale.id, 1),
        annotationVerse(pending.id, 2),
      ]).isPersisted.promise,
    ]);

    const remote = annotation(
      'at://did:plc:new/com.apostilbible.annotation/new',
      'synced',
    );
    const remoteVerse = annotationVerse(remote.id, 3);
    const snapshot: ChapterAnnotationSnapshot = {
      annotations: [remote],
      annotationVerses: [remoteVerse],
    };

    await reconcileChapterAnnotations(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      snapshot,
    );

    expect([...collections.annotations.keys()]).toEqual(
      expect.arrayContaining([pending.id, remote.id]),
    );
    expect(collections.annotations.has(stale.id)).toBe(false);
    expect(
      collections.annotationVerses.has(annotationVerse(pending.id, 2).id),
    ).toBe(true);
    expect(collections.annotationVerses.has(remoteVerse.id)).toBe(true);
    expect(
      collections.annotationVerses.has(annotationVerse(stale.id, 1).id),
    ).toBe(false);
  });

  it('does not remove synced rows from another chapter', async () => {
    const dbClient = new DbClient();
    clients.push(dbClient);
    const collections = getAnnotationCollections(dbClient);
    await collections.annotations.preload();

    const otherChapter = {
      ...annotation(
        'at://did:plc:other/com.apostilbible.annotation/other',
        'synced',
      ),
      chapter: 2,
    };
    await collections.annotations.insert(otherChapter).isPersisted.promise;

    await reconcileChapterAnnotations(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      { annotations: [], annotationVerses: [] },
    );

    expect(collections.annotations.has(otherChapter.id)).toBe(true);
  });
});
