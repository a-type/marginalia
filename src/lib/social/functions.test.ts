import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchAllXrpcRecords,
  fetchXrpcRecordPage,
  getAuthenticatedHappyViewClient,
  getHappyViewSession,
  parseAtRecordUri,
} = vi.hoisted(() => ({
  fetchAllXrpcRecords: vi.fn(),
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
  fetchAllXrpcRecords,
  fetchXrpcRecordPage,
  parseAtRecordUri,
}));

describe('current Bluesky profile and graph queries', () => {
  beforeEach(() => {
    fetchAllXrpcRecords.mockReset();
    fetchXrpcRecordPage.mockReset();
    getAuthenticatedHappyViewClient.mockReset();
    getHappyViewSession.mockReset();
    parseAtRecordUri.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the current actor profile from HappyView and maps its avatar URL', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const happyViewProfile = {
      did,
      handle: 'reader.example',
      displayName: 'Reader',
      avatarURL: 'https://cdn.example/avatar.jpg',
      description: 'A Bible reader',
    };
    const fetchHandler = vi.fn(
      async () =>
        new Response(JSON.stringify(happyViewProfile), { status: 200 }),
    );
    getHappyViewSession.mockResolvedValue({ did, fetchHandler });

    const { getCurrentBlueskyProfile } = await import('./functions');

    await expect(getCurrentBlueskyProfile()).resolves.toEqual({
      did,
      handle: 'reader.example',
      displayName: 'Reader',
      avatar: 'https://cdn.example/avatar.jpg',
      description: 'A Bible reader',
    });
    expect(fetchHandler).toHaveBeenCalledWith(
      '/xrpc/app.bsky.actor.getProfile',
      { method: 'GET' },
    );
  });

  it('seeds profile setup from HappyView when no Apostil profile exists', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const fetchHandler = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            did,
            handle: 'reader.example',
            displayName: 'Reader',
            avatarURL: 'https://cdn.example/avatar.jpg',
            description: 'A Bible reader',
          }),
          { status: 200 },
        ),
    );
    getHappyViewSession.mockResolvedValue({ did, fetchHandler });
    fetchAllXrpcRecords.mockResolvedValue([]);

    const { getProfileSetup } = await import('./functions');

    await expect(getProfileSetup(did)).resolves.toEqual({
      profile: null,
      seed: {
        handle: 'reader.example',
        displayName: 'Reader',
        avatar: 'https://cdn.example/avatar.jpg',
        description: 'A Bible reader',
      },
    });
    expect(fetchHandler).toHaveBeenCalledWith(
      '/xrpc/app.bsky.actor.getProfile',
      { method: 'GET' },
    );
  });

  it('looks up arbitrary actor profiles through the public Bluesky AppView', async () => {
    const profile = {
      did: 'did:plc:abcdefghijklmnopqrstuvwx',
      handle: 'reader.example',
      displayName: 'Reader',
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      requestedUrls.push(
        input instanceof Request ? input.url : input.toString(),
      );
      return new Response(JSON.stringify(profile), { status: 200 });
    });

    const { lookupProfileByHandle } = await import('./functions');

    await expect(
      lookupProfileByHandle({ data: { handle: profile.handle } }),
    ).resolves.toEqual(profile);
    expect(requestedUrls).toEqual([
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(profile.handle)}`,
    ]);
    expect(getHappyViewSession).not.toHaveBeenCalled();
  });

  it('parses the complete HappyView profile record', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const createdAt = '2026-09-30T12:00:00.000Z';
    getHappyViewSession.mockResolvedValue({ did });
    fetchAllXrpcRecords.mockResolvedValue([
      {
        uri: `at://${did}/com.apostilbible.profile/self`,
        cid: 'bafyreitest',
        $type: 'com.apostilbible.profile',
        handle: 'reader.example',
        displayName: 'Reader',
        createdAt,
      },
    ]);
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'self' });

    const { getCurrentProfile } = await import('./functions');

    await expect(getCurrentProfile()).resolves.toMatchObject({
      authorDid: did,
      handle: 'reader.example',
      displayName: 'Reader',
      createdAt,
    });
  });

  it('does not return a successful null result when the session is missing', async () => {
    getHappyViewSession.mockResolvedValue(null);

    const { getProfileSetup } = await import('./functions');

    await expect(
      getProfileSetup('did:plc:abcdefghijklmnopqrstuvwx'),
    ).rejects.toThrow('Invalid HappyView session');
  });

  it('loads follows from the public Bluesky AppView without HappyView auth', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const followedDid = 'did:plc:zyxwvutsrqponmlkjihgfedcba';
    const fetchHandler = vi.fn();
    const requestedUrls: string[] = [];
    getHappyViewSession.mockResolvedValue({ did, fetchHandler });
    fetchAllXrpcRecords.mockResolvedValue([
      {
        uri: `at://${did}/com.apostilbible.follow/self`,
        cid: 'bafyreitest',
        $type: 'com.apostilbible.follow',
        subject: followedDid,
        createdAt: '2026-09-30T12:00:00.000Z',
      },
    ]);
    parseAtRecordUri.mockReturnValue({ authorDid: did, rkey: 'self' });
    fetchXrpcRecordPage.mockResolvedValue({ records: [] });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      requestedUrls.push(
        input instanceof Request ? input.url : input.toString(),
      );
      return new Response(
        JSON.stringify({
          follows: [{ did: followedDid, handle: 'followed.example' }],
        }),
        { status: 200 },
      );
    });

    const { listFollowSuggestions } = await import('./functions');

    await listFollowSuggestions();

    expect(fetchXrpcRecordPage).not.toHaveBeenCalled();
    expect(requestedUrls).toEqual([
      `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(did)}&limit=100`,
    ]);
    expect(fetchHandler).not.toHaveBeenCalled();
  });
});
