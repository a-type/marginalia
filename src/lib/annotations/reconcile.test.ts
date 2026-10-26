import { DbClient } from '@tanstack/react-db';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  AnnotationRecord,
  ChapterAnnotationSnapshot,
} from './collections';
import {
  ensureAnnotationCollectionReady,
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
    chapterKeys: ['GEN/1'],
    verses: ['GEN/1:1'],
    comment: id,
    createdAt: '2026-09-04T00:00:00.000Z',
    status,
    syncError: null,
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
    await ensureAnnotationCollectionReady(collections.annotations);

    const stale = {
      ...annotation(
        'at://did:plc:old/com.marginsbible.annotation/old',
        'synced',
      ),
      verses: ['GEN/1:1'] as AnnotationRecord['verses'],
    };
    const pending = annotation('local:pending', 'pending');
    await collections.annotations.insert([stale, pending]).isPersisted.promise;

    const remote = {
      ...annotation(
        'at://did:plc:new/com.marginsbible.annotation/new',
        'synced',
      ),
      verses: ['GEN/1:3'] as AnnotationRecord['verses'],
    };
    const snapshot: ChapterAnnotationSnapshot = {
      annotations: [remote],
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
    expect(collections.annotations.get(remote.id)?.verses).toEqual(['GEN/1:3']);
  });

  it('removes stale chapter verses but preserves the rest of an annotation', async () => {
    const dbClient = new DbClient();
    clients.push(dbClient);
    const collections = getAnnotationCollections(dbClient);
    await ensureAnnotationCollectionReady(collections.annotations);

    const otherChapter = {
      ...annotation(
        'at://did:plc:other/com.marginsbible.annotation/other',
        'synced',
      ),
      verses: ['GEN/1:1', 'GEN/2:1'] as AnnotationRecord['verses'],
      chapterKeys: ['GEN/1', 'GEN/2'],
    };
    await collections.annotations.insert(otherChapter).isPersisted.promise;

    await reconcileChapterAnnotations(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      { annotations: [] },
    );

    expect(collections.annotations.has(otherChapter.id)).toBe(true);
    expect(collections.annotations.get(otherChapter.id)).toMatchObject({
      chapter: 2,
      verses: ['GEN/2:1'],
    });
  });

  it('preserves verses from other chapters when reconciling a chapter subset', async () => {
    const dbClient = new DbClient();
    clients.push(dbClient);
    const collections = getAnnotationCollections(dbClient);
    await ensureAnnotationCollectionReady(collections.annotations);

    const existing = {
      ...annotation(
        'at://did:plc:author/com.marginsbible.annotation/multi',
        'synced',
      ),
      verses: ['GEN/1:1', 'GEN/2:4'] as AnnotationRecord['verses'],
      chapterKeys: ['GEN/1', 'GEN/2'],
    };
    await collections.annotations.insert(existing).isPersisted.promise;

    await reconcileChapterAnnotations(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      {
        annotations: [
          {
            ...existing,
            verses: ['GEN/1:2'] as AnnotationRecord['verses'],
          },
        ],
      },
    );

    expect(collections.annotations.get(existing.id)?.verses).toEqual([
      'GEN/1:2',
      'GEN/2:4',
    ]);
  });
});
