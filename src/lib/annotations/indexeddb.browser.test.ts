import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  claimAnonymousAnnotations,
  createAnonymousAnnotation,
  deleteAnnotationDatabase,
  listAnnotationsForVerse,
  listPendingAnnotations,
  listVisibleAnnotations,
  markAnnotationSynced,
  reconcileRemoteAnnotations,
} from './indexeddb';

describe('annotation IndexedDB repository', () => {
  beforeEach(deleteAnnotationDatabase);
  afterEach(deleteAnnotationDatabase);

  it('normalizes local annotations and queries real IndexedDB indexes', async () => {
    const annotation = await createAnonymousAnnotation({
      verses: ['GEN/1:3', 'GEN/1:1', 'GEN/1:3'],
      comment: '  A note  ',
    });

    expect(annotation.verses).toEqual(['GEN/1:1', 'GEN/1:3']);
    expect(annotation.comment).toBe('A note');
    expect(await listAnnotationsForVerse('GEN/1:3', null)).toEqual([
      annotation,
    ]);
  });

  it('claims anonymous annotations once and isolates account visibility', async () => {
    const annotation = await createAnonymousAnnotation({
      verses: ['GEN/1:1'],
      color: 'lemon',
    });

    await claimAnonymousAnnotations('did:plc:first');
    expect(await listPendingAnnotations('did:plc:first')).toMatchObject([
      { id: annotation.id, ownerDid: 'did:plc:first' },
    ]);
    expect(await claimAnonymousAnnotations('did:plc:second')).toEqual([]);
    expect(await listVisibleAnnotations('did:plc:second')).toEqual([]);
  });

  it('acknowledges uploads and reconciles a complete remote snapshot', async () => {
    const deleted = await createAnonymousAnnotation({
      verses: ['GEN/1:1'],
      comment: 'Remove remotely',
    });
    const pending = await createAnonymousAnnotation({
      verses: ['GEN/1:2'],
      comment: 'Keep pending',
    });
    await claimAnonymousAnnotations('did:plc:owner');
    await markAnnotationSynced(deleted.id, {
      uri: `at://did:plc:owner/com.marginalia.annotation/${deleted.id}`,
      cid: 'old-cid',
    });

    await reconcileRemoteAnnotations('did:plc:owner', [
      {
        rkey: '3mremote',
        uri: 'at://did:plc:owner/com.marginalia.annotation/3mremote',
        cid: 'new-cid',
        verses: ['GEN/1:4'],
        color: 'blueberry',
        createdAt: '2026-08-30T00:00:00.000Z',
      },
    ]);

    const visible = await listVisibleAnnotations('did:plc:owner');
    expect(visible.map(({ id }) => id).sort()).toEqual(
      ['3mremote', pending.id].sort(),
    );
    expect(await listPendingAnnotations('did:plc:owner')).toMatchObject([
      { id: pending.id },
    ]);
  });
});
