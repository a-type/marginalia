import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAnonymousAnnotation,
  deleteAnnotationDatabase,
  listPendingAnnotations,
  listVisibleAnnotations,
} from './indexeddb';
import type { AnnotationRemote } from './sync-core';
import { synchronizeAnnotations } from './sync-core';
import type { RemoteAnnotation } from './types';

describe('annotation synchronization', () => {
  beforeEach(deleteAnnotationDatabase);
  afterEach(deleteAnnotationDatabase);

  it('claims, uploads, acknowledges, and pulls through real IndexedDB', async () => {
    const local = await createAnonymousAnnotation({
      verses: ['GEN/1:1'],
      comment: 'Offline note',
    });
    const snapshot: RemoteAnnotation[] = [];
    const remote: AnnotationRemote = {
      upload: vi.fn(async (annotation) => {
        const uri = `at://did:plc:owner/com.marginalia.annotation/${annotation.id}`;
        snapshot.push({
          rkey: annotation.id,
          uri,
          cid: 'remote-cid',
          verses: annotation.verses,
          ...(annotation.comment ? { comment: annotation.comment } : {}),
          ...(annotation.color ? { color: annotation.color } : {}),
          createdAt: annotation.createdAt,
        });
        return { uri, cid: 'remote-cid' };
      }),
      list: vi.fn(async () => snapshot),
    };

    await synchronizeAnnotations('did:plc:owner', remote);

    expect(remote.upload).toHaveBeenCalledOnce();
    expect(await listPendingAnnotations('did:plc:owner')).toEqual([]);
    expect(await listVisibleAnnotations('did:plc:owner')).toMatchObject([
      { id: local.id, ownerDid: 'did:plc:owner', syncStatus: 'synced' },
    ]);
  });
});
