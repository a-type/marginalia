import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../error';

const { clientOptions, init, initCallback, signIn } = vi.hoisted(() => ({
  clientOptions: vi.fn(),
  init: vi.fn(),
  initCallback: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('@happyview/oauth-client-browser', () => ({
  HappyViewBrowserClient: class {
    constructor(options: { instanceUrl: string; fetch: typeof fetch }) {
      clientOptions(options);
    }

    init = init;
    initCallback = initCallback;
    signIn = signIn;
  },
}));

vi.mock('./client-metadata', () => ({
  getOAuthClientMetadata: () => ({
    client_id: 'http://localhost/',
    redirect_uris: ['http://127.0.0.1:7654/oauth/callback'],
  }),
  oauthScope:
    'atproto repo?collection=com.marginsbible.annotation&collection=com.marginsbible.highlight&collection=com.marginsbible.profile&collection=com.marginsbible.follow&action=create&action=update rpc?lxm=com.marginsbible.annotation.listForChapter&lxm=com.marginsbible.annotation.listMine&lxm=com.marginsbible.highlight.listForChapter&lxm=com.marginsbible.profile.list&lxm=com.marginsbible.profile.getForDids&lxm=com.marginsbible.follow.list&lxm=app.bsky.actor.getProfile&aud=*',
}));

describe('HappyView OAuth callback initialization', () => {
  beforeEach(() => {
    clientOptions.mockReset();
    init.mockReset();
    initCallback.mockReset();
    signIn.mockReset();
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
    const session = {
      did: 'did:plc:abcdefghijklmnopqrstuvwx',
      fetchHandler: vi.fn(),
    };
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
    const session = {
      did: 'did:plc:abcdefghijklmnopqrstuvwx',
      fetchHandler: vi.fn(),
    };
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

  it('prompts once on expiration, pauses requests, and keeps the account identity', async () => {
    const fetchHandler = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: 'session expired, please re-authenticate' },
          { status: 401 },
        ),
      );
    const session = {
      did: 'did:plc:abcdefghijklmnopqrstuvwx',
      fetchHandler,
    };
    init.mockResolvedValue({ session });
    const { getHappyViewSession, happyViewAuthState } =
      await import('./client');
    await getHappyViewSession();

    await expect(
      session.fetchHandler('/xrpc/com.atproto.repo.putRecord', {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ code: AppError.Code.SessionExpired });
    expect(happyViewAuthState).toMatchObject({
      expiredDid: session.did,
      promptOpen: true,
    });
    await expect(getHappyViewSession()).resolves.toBe(session);

    happyViewAuthState.promptOpen = false;
    await expect(
      session.fetchHandler('/xrpc/com.atproto.repo.putRecord', {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ code: AppError.Code.SessionExpired });
    expect(fetchHandler).toHaveBeenCalledOnce();
    expect(happyViewAuthState.promptOpen).toBe(false);
  });

  it.each([
    Response.json({ error: 'insufficient_scope' }, { status: 401 }),
    new Response('Unauthorized', { status: 401 }),
    Response.json(
      { error: 'session expired, please re-authenticate' },
      { status: 403 },
    ),
  ])(
    'preserves other authentication responses without prompting',
    async (response) => {
      const session = {
        did: 'did:plc:abcdefghijklmnopqrstuvwx',
        fetchHandler: vi.fn().mockResolvedValue(response),
      };
      init.mockResolvedValue({ session });
      const { getHappyViewSession, happyViewAuthState } =
        await import('./client');
      await getHappyViewSession();

      const result = await session.fetchHandler(
        '/xrpc/com.atproto.repo.putRecord',
        {
          method: 'POST',
        },
      );
      expect(result).toBe(response);
      expect(result.bodyUsed).toBe(false);
      expect(happyViewAuthState.expiredDid).toBeNull();
    },
  );

  it('recovers in one shared popup and replaces the session used for subsequent writes', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const expired = {
      did,
      fetchHandler: vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: 'session expired, please re-authenticate' },
            { status: 401 },
          ),
        ),
    };
    const freshFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ uri: 'record' }));
    const fresh = { did, fetchHandler: freshFetch };
    init.mockResolvedValue({ session: expired });
    signIn.mockResolvedValue(fresh);
    const { getHappyViewSession, happyViewAuthState, reauthenticateHappyView } =
      await import('./client');
    await getHappyViewSession();
    await expect(
      expired.fetchHandler('/xrpc/com.atproto.repo.putRecord', {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ code: AppError.Code.SessionExpired });

    await Promise.all([reauthenticateHappyView(), reauthenticateHappyView()]);

    expect(signIn).toHaveBeenCalledExactlyOnceWith(did, { display: 'popup' });
    expect(happyViewAuthState).toMatchObject({
      expiredDid: null,
      promptOpen: false,
    });
    await expect(getHappyViewSession()).resolves.toBe(fresh);
    await fresh.fetchHandler('/xrpc/com.atproto.repo.putRecord', {
      method: 'POST',
    });
    expect(freshFetch).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledOnce();
  });

  it('keeps the expired account recoverable when popup sign-in fails', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    init.mockResolvedValue({ session: { did, fetchHandler: vi.fn() } });
    const { getHappyViewSession, happyViewAuthState, reauthenticateHappyView } =
      await import('./client');
    await getHappyViewSession();
    happyViewAuthState.expiredDid = did;
    happyViewAuthState.promptOpen = true;
    signIn
      .mockRejectedValueOnce(new Error('Popup login failed'))
      .mockResolvedValueOnce({ did, fetchHandler: vi.fn() });

    await expect(reauthenticateHappyView()).rejects.toThrow(
      'Popup login failed',
    );
    expect(happyViewAuthState.expiredDid).toBe(did);
    expect(happyViewAuthState.promptOpen).toBe(true);
    await reauthenticateHappyView();
    expect(happyViewAuthState.expiredDid).toBeNull();
  });

  it('does not resume pending writes under a different account', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const original = { did, fetchHandler: vi.fn() };
    init.mockResolvedValue({ session: original });
    signIn.mockResolvedValue({
      did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
      fetchHandler: vi.fn(),
    });
    const { getHappyViewSession, happyViewAuthState, reauthenticateHappyView } =
      await import('./client');
    await getHappyViewSession();
    happyViewAuthState.expiredDid = did;

    await expect(reauthenticateHappyView()).rejects.toMatchObject({
      code: AppError.Code.SessionInvalid,
    });
    expect(happyViewAuthState.expiredDid).toBe(did);
    await expect(getHappyViewSession()).resolves.toBe(original);
  });

  it('does not expire a recovered session when an old request finishes late', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    let finishRequest!: (response: Response) => void;
    const expired = {
      did,
      fetchHandler: vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finishRequest = resolve;
          }),
      ),
    };
    init.mockResolvedValue({ session: expired });
    signIn.mockResolvedValue({ did, fetchHandler: vi.fn() });
    const { getHappyViewSession, happyViewAuthState, reauthenticateHappyView } =
      await import('./client');
    await getHappyViewSession();
    const pending = expired.fetchHandler('/xrpc/com.atproto.repo.putRecord', {
      method: 'POST',
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: AppError.Code.SessionExpired,
    });
    happyViewAuthState.expiredDid = did;
    await reauthenticateHappyView();
    finishRequest(
      Response.json(
        { error: 'session expired, please re-authenticate' },
        { status: 401 },
      ),
    );
    await rejection;
    expect(happyViewAuthState.expiredDid).toBeNull();
  });
});
