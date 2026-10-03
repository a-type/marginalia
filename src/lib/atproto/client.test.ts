import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { clientOptions, init, initCallback } = vi.hoisted(() => ({
  clientOptions: vi.fn(),
  init: vi.fn(),
  initCallback: vi.fn(),
}));

vi.mock('@happyview/oauth-client-browser', () => ({
  HappyViewBrowserClient: class {
    constructor(options: { instanceUrl: string; fetch: typeof fetch }) {
      clientOptions(options);
    }

    init = init;
    initCallback = initCallback;
  },
}));

vi.mock('./client-metadata', () => ({
  getOAuthClientMetadata: () => ({
    client_id: 'http://localhost/',
    redirect_uris: ['http://127.0.0.1:7654/oauth/callback'],
  }),
  oauthScope:
    'atproto repo?collection=com.apostilbible.annotation&collection=com.apostilbible.highlight&collection=com.apostilbible.profile&collection=com.apostilbible.follow&action=create&action=update rpc?lxm=com.apostilbible.annotation.listForChapter&lxm=com.apostilbible.highlight.listForChapter&lxm=com.apostilbible.profile.list&lxm=com.apostilbible.profile.getForDids&lxm=com.apostilbible.follow.list&lxm=app.bsky.actor.getProfile&aud=*',
}));

describe('HappyView OAuth callback initialization', () => {
  beforeEach(() => {
    clientOptions.mockReset();
    init.mockReset();
    initCallback.mockReset();
    vi.resetModules();
    vi.stubEnv('VITE_HAPPYVIEW_CLIENT_KEY', 'public-test-client-key');
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:7654' },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('shares initialization when callback and session consumers run together', async () => {
    const session = { did: 'did:plc:abcdefghijklmnopqrstuvwx' };
    init.mockResolvedValue({ session });

    const { completeHappyViewOAuthCallback, getHappyViewSession } =
      await import('./client');
    const results = await Promise.all([
      completeHappyViewOAuthCallback(),
      completeHappyViewOAuthCallback(),
      getHappyViewSession(),
    ]);

    expect(results).toEqual([session, session, session]);
    expect(init).toHaveBeenCalledOnce();
    expect(initCallback).not.toHaveBeenCalled();
    expect(clientOptions).toHaveBeenCalledOnce();
    const options = clientOptions.mock.calls[0]?.[0];
    expect(options?.instanceUrl).toBe('http://127.0.0.1:7654');
    expect(options?.fetch).toBeTypeOf('function');
  });

  it('retries session initialization after an unauthenticated result', async () => {
    const session = { did: 'did:plc:abcdefghijklmnopqrstuvwx' };
    init.mockResolvedValueOnce(null).mockResolvedValueOnce({ session });

    const { getHappyViewSession } = await import('./client');

    await expect(getHappyViewSession()).resolves.toBeNull();
    await expect(getHappyViewSession()).resolves.toBe(session);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('sends OAuth API calls under /api and XRPC calls through the root path', async () => {
    const { createHappyViewFetch } = await import('./client');
    const requestedUrls: string[] = [];
    const fetchImplementation: typeof fetch = async (input) => {
      requestedUrls.push(
        input instanceof Request ? input.url : input.toString(),
      );
      return new Response(null, { status: 200 });
    };
    const fetch = createHappyViewFetch(
      'http://127.0.0.1:7654',
      fetchImplementation,
    );

    await fetch('/oauth/dpop-keys', { method: 'POST' });
    await fetch('/xrpc/com.atproto.repo.describeRepo?repo=did%3Aplc%3Atest', {
      method: 'GET',
    });

    expect(requestedUrls).toEqual([
      'http://127.0.0.1:7654/api/oauth/dpop-keys',
      'http://127.0.0.1:7654/xrpc/com.atproto.repo.describeRepo?repo=did%3Aplc%3Atest',
    ]);
  });
});
