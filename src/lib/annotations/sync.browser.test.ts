import { DbClient } from '@tanstack/react-db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnnotationRecord } from './collections';
import {
  ensureAnnotationCollectionReady,
  getAnnotationCollections,
} from './collections';
import { readAnnotationLastSeen, writeAnnotationLastSeen } from './indexeddb';
import { requestAnnotationSync } from './sync';

const { listMyAnnotationsPage, uploadAnnotation } = vi.hoisted(() => ({
  listMyAnnotationsPage: vi.fn(),
  uploadAnnotation: vi.fn(),
}));

vi.mock('./functions', () => ({
  listMyAnnotationsPage,
  uploadAnnotation,
}));

const clients: DbClient[] = [];

function remoteSnapshot(rkey: string, createdAt: string) {
  const annotationId = `at://did:plc:abcdefghijklmnopqrstuvwx/com.marginsbible.annotation/${rkey}`;
  const verseId = 'GEN/1:1' as const;
  const annotation: AnnotationRecord = {
    id: annotationId,
    rkey,
    uri: annotationId,
    cid: `cid-${rkey}`,
    authorDid: 'did:plc:abcdefghijklmnopqrstuvwx',
    bookId: 'GEN',
    chapter: 1,
    chapterKeys: ['GEN/1'],
    verses: [verseId],
    comment: rkey,
    createdAt,
    status: 'synced',
    syncError: null,
  };
  return { annotations: [annotation] };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.cleanup()));
});

beforeEach(() => {
  listMyAnnotationsPage.mockReset();
  uploadAnnotation.mockReset();
});

describe('requestAnnotationSync', () => {
  it('uploads local ownership and pulls pages through the previous cutoff', async () => {
    const ownerDid = 'did:plc:abcdefghijklmnopqrstuvwx';
    const dbClient = new DbClient();
    clients.push(dbClient);
    const collections = getAnnotationCollections(dbClient);
    await ensureAnnotationCollectionReady(collections.annotations);

    const localRkey = crypto.randomUUID();
    const localId = `local:${localRkey}`;
    const localAnnotation: AnnotationRecord = {
      id: localId,
      rkey: localRkey,
      uri: null,
      cid: null,
      authorDid: null,
      bookId: 'GEN',
      chapter: 1,
      chapterKeys: ['GEN/1'],
      verses: ['GEN/1:2'],
      comment: 'Created offline',
      createdAt: '2026-10-01T00:00:00.000Z',
      status: 'pending',
      syncError: null,
    };
    await collections.annotations.insert(localAnnotation).isPersisted.promise;

    const firstPage = remoteSnapshot('newest', '2026-10-03T00:00:00.000Z');
    const secondPage = remoteSnapshot('last-seen', '2026-10-02T00:00:00.000Z');
    listMyAnnotationsPage
      .mockResolvedValueOnce({ ...firstPage, cursor: 'next-page' })
      .mockResolvedValueOnce({ ...secondPage });
    uploadAnnotation.mockResolvedValue({
      uri: `at://${ownerDid}/com.marginsbible.annotation/${localRkey}`,
      cid: 'uploaded-cid',
    });

    await requestAnnotationSync(dbClient, ownerDid);

    expect(listMyAnnotationsPage).toHaveBeenNthCalledWith(1, {
      data: { cursor: undefined },
    });
    expect(listMyAnnotationsPage).toHaveBeenNthCalledWith(2, {
      data: { cursor: 'next-page' },
    });
    const claimedId = `at://${ownerDid}/com.marginsbible.annotation/${localRkey}`;
    expect(collections.annotations.get(claimedId)).toMatchObject({
      authorDid: ownerDid,
      status: 'uploaded',
    });
    expect(uploadAnnotation).toHaveBeenCalledWith({
      data: expect.objectContaining({ verses: ['GEN/1:2'] }),
    });
    expect(collections.annotations.has(localId)).toBe(false);
    expect(collections.annotations.has(firstPage.annotations[0].id)).toBe(true);
    expect(collections.annotations.has(secondPage.annotations[0].id)).toBe(
      true,
    );
    expect(await readAnnotationLastSeen(ownerDid)).toBe(
      firstPage.annotations[0].id,
    );
  });

  it('stops fetching once the stored last-seen annotation is reached', async () => {
    const ownerDid = 'did:plc:zyxwvutsrqponmlkjihgfedc';
    const dbClient = new DbClient();
    clients.push(dbClient);
    const collections = getAnnotationCollections(dbClient);
    await ensureAnnotationCollectionReady(collections.annotations);

    const newer = remoteSnapshot('newer', '2026-10-03T00:00:00.000Z');
    const lastSeen = remoteSnapshot(
      'stored-cutoff',
      '2026-10-02T00:00:00.000Z',
    );
    const older = remoteSnapshot('older', '2026-10-01T00:00:00.000Z');
    await writeAnnotationLastSeen(ownerDid, lastSeen.annotations[0].id);
    listMyAnnotationsPage.mockResolvedValue({
      annotations: [
        newer.annotations[0],
        lastSeen.annotations[0],
        older.annotations[0],
      ],
      cursor: 'next-page',
    });

    await requestAnnotationSync(dbClient, ownerDid);

    expect(listMyAnnotationsPage).toHaveBeenCalledTimes(1);
    expect(collections.annotations.has(newer.annotations[0].id)).toBe(true);
    expect(collections.annotations.has(lastSeen.annotations[0].id)).toBe(true);
    expect(collections.annotations.has(older.annotations[0].id)).toBe(false);
  });
});
