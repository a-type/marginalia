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

describe('chapter highlight records', () => {
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
      uri: `at://${did}/com.marginsbible.highlight/rkey`,
      cid: 'bafyreitest',
      $type: 'com.marginsbible.highlight',
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
  }, 10_000);

  it('only deletes highlights owned by the authenticated account', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const deleteRecord = vi.fn();
    getAuthenticatedHappyViewClient.mockResolvedValue({
      session: { did },
      client: { deleteRecord },
    });
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'highlight-gen' });
    const { deleteHighlight } = await import('./functions');
    const uri = `at://${did}/com.marginsbible.highlight/highlight-gen`;

    await deleteHighlight({ data: { uri } });
    expect(deleteRecord).toHaveBeenCalledWith(
      'com.marginsbible.highlight',
      'highlight-gen',
      { repo: did },
    );
    parseAtRecordUri.mockReturnValue({
      authorDid: 'did:plc:other',
      rkey: 'highlight-gen',
    });
    await expect(deleteHighlight({ data: { uri } })).rejects.toThrow(
      "Cannot delete another account's highlight",
    );
    expect(deleteRecord).toHaveBeenCalledTimes(1);
  });
});
