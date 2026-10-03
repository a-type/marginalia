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

describe('chapter highlight records', () => {
  beforeEach(() => {
    fetchXrpcRecordPage.mockReset();
    getHappyViewSession.mockReset();
    parseAtRecordUri.mockReset();
  });

  it('parses the complete lexicon record including its $type', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const createdAt = '2026-09-30T12:00:00.000Z';
    const record = {
      uri: `at://${did}/com.apsotilbible.highlight/rkey`,
      cid: 'bafyreitest',
      $type: 'com.apsotilbible.highlight',
      verse: { id: 'GEN/1:1' },
      color: 'lemon',
      createdAt,
    };
    getHappyViewSession.mockResolvedValue({ did });
    fetchXrpcRecordPage.mockResolvedValue({ records: [record] });
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'rkey' });

    const { listChapterHighlights } = await import('./functions');
    const snapshot = await listChapterHighlights({
      data: { bookId: 'GEN', chapter: 1 },
    });

    expect(snapshot.highlights).toHaveLength(1);
    expect(snapshot.highlights[0]).toMatchObject({
      id: record.uri,
      authorDid: did,
      verseId: 'GEN/1:1',
      color: 'lemon',
      createdAt,
    });
  });
});
