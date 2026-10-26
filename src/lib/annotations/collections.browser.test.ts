import { DbClient, inArray } from '@tanstack/react-db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnnotationRecord } from './collections';
import {
  ensureAnnotationCollectionReady,
  getAnnotationCollections,
} from './collections';

const clients: DbClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.cleanup()));
});

describe('annotation collections', () => {
  it('persists annotations across browser DbClient instances', async () => {
    const firstClient = new DbClient();
    clients.push(firstClient);
    const first = getAnnotationCollections(firstClient);
    await ensureAnnotationCollectionReady(first.annotations);

    const annotation: AnnotationRecord = {
      id: 'local:test',
      rkey: 'test',
      uri: null,
      cid: null,
      authorDid: null,
      bookId: 'GEN',
      chapter: 1,
      chapterKeys: ['GEN/1'],
      verses: ['GEN/1:1'],
      comment: 'Persisted locally',
      createdAt: '2026-09-04T00:00:00.000Z',
      status: 'pending',
      syncError: null,
    };
    await first.annotations.insert(annotation).isPersisted.promise;

    const secondClient = new DbClient();
    clients.push(secondClient);
    const second = getAnnotationCollections(secondClient);
    await ensureAnnotationCollectionReady(second.annotations);
    await second.annotations.utils.loadAll();

    expect(second.annotations.get(annotation.id)).toMatchObject(annotation);
  });

  it('loads chapter and verse queries through IndexedDB indexes', async () => {
    const firstClient = new DbClient();
    clients.push(firstClient);
    const first = getAnnotationCollections(firstClient);
    await ensureAnnotationCollectionReady(first.annotations);

    const chapterAnnotation: AnnotationRecord = {
      id: `local:${crypto.randomUUID()}`,
      rkey: 'chapter-index',
      uri: null,
      cid: null,
      authorDid: null,
      bookId: 'GEN',
      chapter: 1,
      chapterKeys: ['GEN/1', 'GEN/713'],
      verses: ['GEN/1:1', 'GEN/713:1'],
      comment: 'Chapter indexed',
      createdAt: '2026-09-04T00:00:00.000Z',
      status: 'pending',
      syncError: null,
    };
    const verseAnnotation: AnnotationRecord = {
      ...chapterAnnotation,
      id: `local:${crypto.randomUUID()}`,
      rkey: 'verse-index',
      bookId: 'EXO',
      chapter: 714,
      chapterKeys: ['EXO/714'],
      verses: ['EXO/714:2'],
      comment: 'Verse indexed',
    };
    await first.annotations.insert([chapterAnnotation, verseAnnotation])
      .isPersisted.promise;

    const secondClient = new DbClient();
    clients.push(secondClient);
    const second = getAnnotationCollections(secondClient);
    await ensureAnnotationCollectionReady(second.annotations);
    const indexedNames: string[] = [];
    const originalIndex = IDBObjectStore.prototype.index;
    const indexSpy = vi
      .spyOn(IDBObjectStore.prototype, 'index')
      .mockImplementation(function (this: IDBObjectStore, name) {
        indexedNames.push(name);
        return Reflect.apply(originalIndex, this, [name]);
      });

    const chapterSubscription = second.annotations.subscribeChanges(
      () => undefined,
      {
        includeInitialState: true,
        where: (annotation) => inArray('GEN/713', annotation.chapterKeys),
      },
    );
    await vi.waitFor(() => {
      expect(second.annotations.has(chapterAnnotation.id)).toBe(true);
    });
    chapterSubscription.unsubscribe();

    const verseSubscription = second.annotations.subscribeChanges(
      () => undefined,
      {
        includeInitialState: true,
        where: (annotation) => inArray('EXO/714:2', annotation.verses),
      },
    );
    await vi.waitFor(() => {
      expect(second.annotations.has(verseAnnotation.id)).toBe(true);
    });
    verseSubscription.unsubscribe();
    indexSpy.mockRestore();

    expect(indexedNames).toContain('by-chapter');
    expect(indexedNames).toContain('by-verse');
  });
});
