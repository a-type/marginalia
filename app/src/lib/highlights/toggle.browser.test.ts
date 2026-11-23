import { DbClient } from '@tanstack/react-db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHighlightCollections } from './collections';
import { createHighlight } from './create';
import { reconcileChapterHighlights } from './reconcile';
import { requestHighlightSync } from './sync';
import { toggleHighlight } from './toggle';

const { getCurrentUserDid, uploadHighlight, deleteHighlight } = vi.hoisted(
  () => ({
    getCurrentUserDid: vi.fn(),
    uploadHighlight: vi.fn(),
    deleteHighlight: vi.fn(),
  }),
);

vi.mock('../auth/functions', () => ({ getCurrentUserDid }));
vi.mock('./functions', () => ({ uploadHighlight, deleteHighlight }));

const ownerDid = 'did:plc:abcdefghijklmnopqrstuvwx';
const clients: DbClient[] = [];

beforeEach(() => {
  localStorage.removeItem('margins.highlights.v1');
  getCurrentUserDid.mockReset().mockResolvedValue(null);
  uploadHighlight.mockReset();
  deleteHighlight.mockReset();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.cleanup()));
  vi.unstubAllGlobals();
});

function createClient() {
  const dbClient = new DbClient();
  clients.push(dbClient);
  return dbClient;
}

describe('highlight toggle', () => {
  it('removes any existing color and toggles back on in yellow', async () => {
    const dbClient = createClient();
    const original = await createHighlight(dbClient, {
      verseId: 'GEN/1:1',
      color: 'tomato',
    });
    const { highlights } = getHighlightCollections(dbClient);

    await toggleHighlight(dbClient, original.verseId);
    expect(highlights.has(original.id)).toBe(false);

    await toggleHighlight(dbClient, original.verseId);
    expect([...highlights.values()]).toMatchObject([
      { verseId: original.verseId, color: 'lemon' },
    ]);
  });

  it('keeps offline removals hidden until the remote snapshot confirms deletion', async () => {
    const dbClient = createClient();
    getCurrentUserDid.mockResolvedValue(ownerDid);
    const original = await createHighlight(dbClient, {
      verseId: 'GEN/1:2',
      color: 'blueberry',
    });
    const { highlights } = getHighlightCollections(dbClient);
    const uri = original.id;
    await highlights.update(original.id, (draft) => {
      draft.uri = uri;
      draft.status = 'synced';
    }).isPersisted.promise;
    const remote = { ...original, uri, status: 'synced' as const };

    vi.stubGlobal('navigator', { onLine: false });
    await toggleHighlight(dbClient, original.verseId);
    await requestHighlightSync(dbClient, ownerDid);
    await reconcileChapterHighlights(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      { highlights: [remote] },
    );
    expect(highlights.get(original.id)?.status).toBe('deleting');
    expect(deleteHighlight).not.toHaveBeenCalled();

    vi.stubGlobal('navigator', { onLine: true });
    deleteHighlight.mockResolvedValue(undefined);
    await requestHighlightSync(dbClient, ownerDid);
    expect(deleteHighlight).toHaveBeenCalledWith({ data: { uri } });
    expect(highlights.get(original.id)?.status).toBe('deleted');
    await reconcileChapterHighlights(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      { highlights: [remote] },
    );
    expect(highlights.get(original.id)?.status).toBe('deleted');
    await reconcileChapterHighlights(
      dbClient,
      { bookId: 'GEN', chapter: 1 },
      { highlights: [] },
    );
    expect(highlights.has(original.id)).toBe(false);
  });

  it('removes a highlight whose upload is already in flight', async () => {
    const dbClient = createClient();
    getCurrentUserDid.mockResolvedValue(ownerDid);
    vi.stubGlobal('navigator', { onLine: true });
    const original = await createHighlight(dbClient, {
      verseId: 'GEN/1:3',
      color: 'lemon',
    });
    let finishUpload!: (result: { uri: string; cid: string }) => void;
    uploadHighlight.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }),
    );
    deleteHighlight.mockResolvedValue(undefined);

    const uploading = requestHighlightSync(dbClient, ownerDid);
    await vi.waitFor(() => expect(uploadHighlight).toHaveBeenCalled());
    await toggleHighlight(dbClient, original.verseId);
    const deleting = requestHighlightSync(dbClient, ownerDid);
    finishUpload({ uri: original.id, cid: 'cid' });
    await Promise.all([uploading, deleting]);

    expect(deleteHighlight).toHaveBeenCalledWith({
      data: { uri: original.id },
    });
    expect(
      getHighlightCollections(dbClient).highlights.get(original.id),
    ).toMatchObject({ status: 'deleted' });
  });

  it('retains failed remote removals for retry', async () => {
    const dbClient = createClient();
    getCurrentUserDid.mockResolvedValue(ownerDid);
    vi.stubGlobal('navigator', { onLine: true });
    const original = await createHighlight(dbClient, {
      verseId: 'GEN/1:4',
      color: 'lemon',
    });
    const { highlights } = getHighlightCollections(dbClient);
    await highlights.update(original.id, (draft) => {
      draft.uri = original.id;
      draft.status = 'synced';
    }).isPersisted.promise;
    await toggleHighlight(dbClient, original.verseId);
    deleteHighlight
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce(undefined);

    await requestHighlightSync(dbClient, ownerDid);
    expect(highlights.get(original.id)).toMatchObject({
      status: 'deleting',
      syncError: 'Network failed',
    });
    await requestHighlightSync(dbClient, ownerDid);
    expect(highlights.get(original.id)).toMatchObject({
      status: 'deleted',
      syncError: null,
    });
  });
});
