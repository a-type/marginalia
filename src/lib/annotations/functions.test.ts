import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchXrpcRecordPage, getHappyViewSession, parseAtRecordUri } =
  vi.hoisted(() => ({
    fetchXrpcRecordPage: vi.fn(),
    getHappyViewSession: vi.fn(),
    parseAtRecordUri: vi.fn(),
  }));

vi.mock('#/lib/atproto/client', () => ({
  getAuthenticatedHappyViewClient: vi.fn(),
  getHappyViewSession,
}));

vi.mock('#/lib/atproto/xrpc', () => ({
  fetchXrpcRecordPage,
  parseAtRecordUri,
}));

describe('chapter annotation records', () => {
  beforeEach(() => {
    fetchXrpcRecordPage.mockReset();
    getHappyViewSession.mockReset();
    parseAtRecordUri.mockReset();
  });

  it('parses the complete lexicon record including its $type', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const createdAt = '2026-09-30T12:00:00.000Z';
    const record = {
      uri: `at://${did}/com.marginalia.annotation/rkey`,
      cid: 'bafyreitest',
      $type: 'com.marginalia.annotation',
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
      comment: 'A note',
      createdAt,
    });
  });
});
