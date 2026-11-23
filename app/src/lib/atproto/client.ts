import { Client } from '@atproto/lex';
import { createAgent } from '@happyview/lex-agent';
import { HappyViewBrowserClient } from '@happyview/oauth-client-browser';
import { proxy } from 'valtio';

import { logger } from '../../logger';
import { AppError } from '../error';
import { getOAuthClientMetadata, oauthScope } from './client-metadata';

export type HappyViewSession = NonNullable<
  NonNullable<Awaited<ReturnType<HappyViewBrowserClient['init']>>>['session']
>;

let oauthClient: HappyViewBrowserClient | undefined;
let sessionPromise: Promise<HappyViewSession | null> | undefined;
let activeSession: HappyViewSession | null = null;
let reauthenticationPromise: Promise<void> | undefined;

export const happyViewAuthState = proxy<{
  expiredDid: string | null;
  promptOpen: boolean;
}>({
  expiredDid: null,
  promptOpen: false,
});

async function isExpiredSessionResponse(response: Response) {
  if (response.status !== 401) return false;

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch (error) {
    logger.warn('HappyView returned a non-JSON authentication error', error);
    return false;
  }
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    body.error === 'session expired, please re-authenticate'
  );
}

function activateSession(session: HappyViewSession) {
  if (activeSession === session) return session;

  const fetchHandler = session.fetchHandler.bind(session);
  session.fetchHandler = async (path, init) => {
    const url = new URL(path, window.location.origin);
    const isXrpc =
      url.origin === window.location.origin &&
      (url.pathname.startsWith('/xrpc/') ||
        url.pathname.startsWith('/api/xrpc/'));
    if (isXrpc && happyViewAuthState.expiredDid === session.did) {
      throw new AppError(
        AppError.Code.SessionExpired,
        'Sign in again required',
      );
    }

    const response = await fetchHandler(path, init);
    // Inspect after the SDK has completed DPoP nonce negotiation.
    if (isXrpc && (await isExpiredSessionResponse(response))) {
      if (activeSession === session && !happyViewAuthState.expiredDid) {
        happyViewAuthState.expiredDid = session.did;
        happyViewAuthState.promptOpen = true;
      }
      throw new AppError(
        AppError.Code.SessionExpired,
        'HappyView session expired; sign in again to resume syncing',
        response,
      );
    }
    return response;
  };
  activeSession = session;
  return session;
}

export function createHappyViewFetch(
  origin: string,
  fetchImplementation: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(requestUrl, origin);
    // Prefix OAuth only: HappyView strips /api before DPoP checks, and XRPC is root-proxied.
    if (
      url.origin === origin &&
      (url.pathname === '/oauth' || url.pathname.startsWith('/oauth/'))
    ) {
      url.pathname = `/api${url.pathname}`;
    }

    const request = input instanceof Request ? new Request(url, input) : url;
    return fetchImplementation(request, init);
  };
}

function getOAuthClient() {
  if (typeof window === 'undefined') {
    throw new AppError(
      AppError.Code.InternalServerError,
      'HappyView OAuth is only available in the browser',
    );
  }

  if (oauthClient) return oauthClient;

  const clientKey = import.meta.env.VITE_HAPPYVIEW_CLIENT_KEY;
  if (!clientKey) {
    throw new AppError(
      AppError.Code.InternalServerError,
      'VITE_HAPPYVIEW_CLIENT_KEY is not configured',
    );
  }

  const metadata = getOAuthClientMetadata(window.location.origin);
  const origin = window.location.origin;
  oauthClient = new HappyViewBrowserClient({
    instanceUrl: origin,
    clientId: metadata.client_id,
    clientKey,
    redirectUri: metadata.redirect_uris[0],
    scopes: oauthScope,
    fetch: createHappyViewFetch(origin),
  });
  return oauthClient;
}

export async function getHappyViewSession(): Promise<HappyViewSession | null> {
  if (typeof window === 'undefined') return null;

  if (!sessionPromise) {
    sessionPromise = getOAuthClient()
      .init()
      .then((result) =>
        result?.session ? activateSession(result.session) : null,
      );
  }

  const pendingSession = sessionPromise;
  try {
    const session = await pendingSession;
    if (!session && sessionPromise === pendingSession) {
      sessionPromise = undefined;
    }
    return session;
  } catch (error: unknown) {
    if (sessionPromise === pendingSession) {
      sessionPromise = undefined;
    }
    throw error;
  }
}

export async function completeHappyViewOAuthCallback() {
  const session = await getHappyViewSession();
  if (!session) {
    throw new AppError(
      AppError.Code.Unauthorized,
      'OAuth callback did not establish a session',
    );
  }
  return session;
}

export async function signInToHappyView(identifier: string) {
  await getOAuthClient().signIn(identifier);
}

export function reauthenticateHappyView(): Promise<void> {
  if (reauthenticationPromise) return reauthenticationPromise;

  const did = happyViewAuthState.expiredDid;
  if (!did) {
    return Promise.reject(
      new AppError(
        AppError.Code.SessionInvalid,
        'No expired session to recover',
      ),
    );
  }

  const recovery = async () => {
    const session = await getOAuthClient().signIn(did, { display: 'popup' });
    if (!session || session.did !== did) {
      throw new AppError(
        AppError.Code.SessionInvalid,
        'Sign in again with the same account to resume syncing',
      );
    }
    sessionPromise = Promise.resolve(activateSession(session));
    happyViewAuthState.expiredDid = null;
    happyViewAuthState.promptOpen = false;
  };
  reauthenticationPromise = recovery().finally(() => {
    reauthenticationPromise = undefined;
  });
  return reauthenticationPromise;
}

export async function signOutOfHappyView() {
  const session = await getHappyViewSession();
  if (session) {
    await getOAuthClient().revoke(session.did);
  }
  sessionPromise = undefined;
  activeSession = null;
  happyViewAuthState.expiredDid = null;
  happyViewAuthState.promptOpen = false;
  window.location.replace('/');
}

export async function getAuthenticatedHappyViewClient() {
  const session = await getHappyViewSession();
  if (!session) {
    throw new AppError(AppError.Code.Unauthorized, 'Sign in required');
  }
  return { session, client: new Client(createAgent(session)) };
}
