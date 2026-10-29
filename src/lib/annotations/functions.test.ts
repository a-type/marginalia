import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchXrpcRecordPage,
  getAuthenticatedHappyViewClient,
  getHappyViewSession,
  parseAtRecordUri,
} = vi.hoisted(() => ({
  fetchXrpcRecordPage: vi.fn(),
  getAuthenticatedHappyViewClient: vi.fn(),
  getHappyViewSession: vi.fn(),
  parseAtRecordUri: vi.fn(),
}));

vi.mock('#/lib/atproto/client', () => ({
  getAuthenticatedHappyViewClient,
  getHappyViewSession,
}));

vi.mock('#/lib/atproto/xrpc', () => ({
  fetchXrpcRecordPage,
  parseAtRecordUri,
}));

describe('chapter annotation records', () => {
  beforeEach(() => {
    fetchXrpcRecordPage.mockReset();
    getAuthenticatedHappyViewClient.mockReset();
    getHappyViewSession.mockReset();
    parseAtRecordUri.mockReset();
  });

  it('parses the complete lexicon record including its $type', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const createdAt = '2026-09-30T12:00:00.000Z';
    const record = {
      uri: `at://${did}/com.marginsbible.annotation/rkey`,
      cid: 'bafyreitest',
      $type: 'com.marginsbible.annotation',
      verses: [{ id: 'GEN/1:1' }],
      comment: 'A note',
      createdAt,
    };
    getHappyViewSession.mockResolvedValue({ did });
    fetchXrpcRecordPage.mockResolvedValue({ records: [record] });
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'rkey' });

    const { listChapterAnnotations } = await import('./functions');
    const snapshot = await listChapterAnnotations({
      data: { bookId: 'GEN', chapter: 1 },
    });

    expect(snapshot.annotations).toHaveLength(1);
    expect(snapshot.annotations[0]).toMatchObject({
      id: record.uri,
      authorDid: did,
      chapterKeys: ['GEN/1'],
      comment: 'A note',
      createdAt,
    });
  });

  it('lists only caller annotations and forwards its page cursor', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const record = {
      uri: `at://${did}/com.marginsbible.annotation/rkey`,
      cid: 'bafyreitest',
      $type: 'com.marginsbible.annotation',
      verses: [{ id: 'GEN/1:1' }],
      comment: 'A note',
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    getHappyViewSession.mockResolvedValue({ did });
    fetchXrpcRecordPage.mockResolvedValue({
      records: [record],
      cursor: 'next',
    });

    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'rkey' });

    const { listMyAnnotationsPage } = await import('./functions');
    const page = await listMyAnnotationsPage({ data: { cursor: 'previous' } });

    expect(fetchXrpcRecordPage).toHaveBeenCalledWith(
      { did },
      'com.marginsbible.annotation.listMine',
      { limit: '100', cursor: 'previous' },
    );
    expect(page.cursor).toBe('next');
    expect(page.annotations).toHaveLength(1);
    expect(page.annotations[0].authorDid).toBe(did);
  });

  it('preserves scripture order and the primary verse across chapters when pulling annotations', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const record = {
      uri: `at://${did}/com.marginsbible.annotation/rkey`,
      $type: 'com.marginsbible.annotation',
      verses: [{ id: 'JHN/4:2' }, { id: 'JHN/3:36' }, { id: 'JHN/4:1' }],
      comment: 'A cross-chapter note',
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    getHappyViewSession.mockResolvedValue({ did });
    fetchXrpcRecordPage.mockResolvedValue({ records: [record] });
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'rkey' });

    const { listMyAnnotationsPage } = await import('./functions');
    const page = await listMyAnnotationsPage({ data: {} });

    expect(page.annotations[0]).toMatchObject({
      bookId: 'JHN',
      chapter: 3,
      verses: ['JHN/3:36', 'JHN/4:1', 'JHN/4:2'],
      chapterKeys: ['JHN/3', 'JHN/4'],
    });
  });

  it('rejects annotation records outside the authenticated caller', async () => {
    const ownerDid = 'did:plc:abcdefghijklmnopqrstuvwx';
    const otherDid = 'did:plc:zyxwvutsrqponmlkjihgfedc';
    const record = {
      uri: `at://${otherDid}/com.marginsbible.annotation/rkey`,
      cid: 'bafyreitest',
      $type: 'com.marginsbible.annotation',
      verses: [{ id: 'GEN/1:1' }],
      comment: 'A note',
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    getHappyViewSession.mockResolvedValue({ did: ownerDid });
    fetchXrpcRecordPage.mockResolvedValue({ records: [record] });
    parseAtRecordUri.mockReturnValue({ authorDid: otherDid, rkey: 'rkey' });

    const { listMyAnnotationsPage } = await import('./functions');
    const page = await listMyAnnotationsPage({ data: {} });

    expect(page.annotations).toEqual([]);
  });

  it('deletes an owned annotation through the authenticated repo xrpc', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const deleteRecord = vi.fn();
    getAuthenticatedHappyViewClient.mockResolvedValue({
      session: { did },
      client: { deleteRecord },
    });
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'rkey' });

    const { deleteAnnotation } = await import('./functions');
    await deleteAnnotation({
      data: {
        uri: `at://${did}/com.marginsbible.annotation/rkey`,
      },
    });

    expect(deleteRecord).toHaveBeenCalledWith(
      'com.marginsbible.annotation',
      'rkey',
      { repo: did },
    );
  });

  it('rejects deleting an annotation owned by another account', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const deleteRecord = vi.fn();
    getAuthenticatedHappyViewClient.mockResolvedValue({
      session: { did },
      client: { deleteRecord },
    });
    parseAtRecordUri.mockReturnValue({
      authorDid: 'did:plc:zyxwvutsrqponmlkjihgfedc',
      rkey: 'rkey',
    });

    const { deleteAnnotation } = await import('./functions');
    await expect(
      deleteAnnotation({
        data: {
          uri: `at://${did}/com.marginsbible.annotation/rkey`,
        },
      }),
    ).rejects.toMatchObject({ code: 40300 });

    expect(deleteRecord).not.toHaveBeenCalled();
  });
});
