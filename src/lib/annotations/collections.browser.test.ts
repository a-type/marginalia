import { DbClient } from '@tanstack/react-db';
import { afterEach, describe, expect, it } from 'vitest';

import {
  annotationPaneCollectionOptions,
  getAnnotationCollections,
} from './collections';
import type { AnnotationRecord } from './collections';

const clients: DbClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.cleanup()));
  localStorage.removeItem('marginalia.annotations.v2');
  localStorage.removeItem('marginalia.annotation-verses.v2');
});

describe('annotation collections', () => {
  it('persists annotations across browser DbClient instances', async () => {
    const firstClient = new DbClient();
    clients.push(firstClient);
    const first = getAnnotationCollections(firstClient);
    await first.annotations.preload();

    const annotation: AnnotationRecord = {
      id: 'local:test',
      rkey: 'test',
      uri: null,
      cid: null,
      authorDid: null,
      bookId: 'GEN',
      chapter: 1,
      comment: 'Persisted locally',
      createdAt: '2026-09-04T00:00:00.000Z',
      status: 'pending',
      syncError: null,
    };
    await first.annotations.insert(annotation).isPersisted.promise;

    const secondClient = new DbClient();
    clients.push(secondClient);
    const second = getAnnotationCollections(secondClient);
    await second.annotations.preload();

    expect(second.annotations.get(annotation.id)).toMatchObject(annotation);
  });

  it('keeps LocalOnly pane state scoped to each DbClient', async () => {
    const firstClient = new DbClient();
    const secondClient = new DbClient();
    clients.push(firstClient, secondClient);
    const firstPane = firstClient.collection(annotationPaneCollectionOptions);
    const secondPane = secondClient.collection(annotationPaneCollectionOptions);
    await Promise.all([firstPane.preload(), secondPane.preload()]);

    await firstPane.update('annotation-pane', (draft) => {
      draft.editing = true;
      draft.draftVerses = ['GEN/1:1'];
    }).isPersisted.promise;

    expect(firstPane.get('annotation-pane')?.editing).toBe(true);
    expect(secondPane.get('annotation-pane')?.editing).toBe(false);
  });
});
