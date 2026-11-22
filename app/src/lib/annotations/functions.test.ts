import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAnnotation,
  listChapterAnnotations,
  listFollowingAnnotationsPage,
  listMyAnnotationsPage,
  uploadAnnotation,
} from './functions';

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

  it('does not request the following feed without a session', async () => {
    getHappyViewSession.mockResolvedValue(null);
    await expect(listFollowingAnnotationsPage({ data: {} })).resolves.toEqual({
      annotations: [],
    });
    expect(fetchXrpcRecordPage).not.toHaveBeenCalled();
  });

  it('preserves the feed page order and cursor while discarding malformed records', async () => {
    const did = 'did:plc:me';
    const authorDid = 'did:plc:friend';
    const record = {
      uri: `at://${authorDid}/com.marginsbible.annotation/new`,
      $type: 'com.marginsbible.annotation',
      verses: [{ id: 'GEN/1:1' }, { id: 'EXO/2:1' }],
      comment: 'A note',
      createdAt: '2026-10-29T11:30:00-01:00',
    };
    const earlier = {
      ...record,
      uri: `at://${authorDid}/com.marginsbible.annotation/old`,
      createdAt: '2026-10-29T12:00:00Z',
    };
    getHappyViewSession.mockResolvedValue({ did });
    fetchXrpcRecordPage.mockResolvedValue({
      records: [record, { ...record, comment: '' }, earlier],
      cursor: 'next',
    });
    parseAtRecordUri.mockReturnValue({ authorDid, rkey: 'unused' });

    const page = await listFollowingAnnotationsPage({
      data: { cursor: 'previous' },
    });
    expect(fetchXrpcRecordPage).toHaveBeenCalledWith(
      { did },
      'com.marginsbible.annotation.listFollowing',
      { cursor: 'previous' },
    );
    expect(page.annotations.map(({ id }) => id)).toEqual([
      record.uri,
      earlier.uri,
    ]);
    expect(page.cursor).toBe('next');
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
      translation: 'ENG_WEBU',
      createdAt,
    };
    getHappyViewSession.mockResolvedValue({ did });
    fetchXrpcRecordPage.mockResolvedValue({ records: [record] });
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'rkey' });

    const snapshot = await listChapterAnnotations({
      data: { bookId: 'GEN', chapter: 1 },
    });

    expect(snapshot.annotations).toHaveLength(1);
    expect(snapshot.annotations[0]).toMatchObject({
      id: record.uri,
      authorDid: did,
      chapterKeys: ['GEN/1'],
      comment: 'A note',
      translation: 'eng_webu',
      createdAt,
    });
  });

  it('uploads a lowercase translation and supports older records without one', async () => {
    const putRecord = vi.fn().mockResolvedValue({
      body: { uri: 'at://example', cid: 'cid' },
    });
    getAuthenticatedHappyViewClient.mockResolvedValue({
      client: { putRecord },
    });
    const data = {
      rkey: '3jzfcijpj2z2a',
      verses: ['GEN/1:1'],
      comment: 'A note',
      createdAt: '2026-09-30T12:00:00.000Z',
    };

    await uploadAnnotation({ data: { ...data, translation: 'ENG_WEBU' } });
    expect(putRecord.mock.calls[0][0]).toMatchObject({
      translation: 'eng_webu',
    });
    await uploadAnnotation({ data });
    expect(putRecord.mock.calls[1][0].translation).toBeUndefined();
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
