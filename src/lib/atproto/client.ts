import { Client } from '@atproto/lex';
import { createAgent } from '@happyview/lex-agent';
import { HappyViewBrowserClient } from '@happyview/oauth-client-browser';

import { AppError } from '#/lib/error';
import { getOAuthClientMetadata, oauthScope } from './client-metadata';

export type HappyViewSession = NonNullable<
  NonNullable<Awaited<ReturnType<HappyViewBrowserClient['init']>>>['session']
>;

let oauthClient: HappyViewBrowserClient | undefined;
let sessionPromise: Promise<HappyViewSession | null> | undefined;

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
      .then((result) => result?.session ?? null);
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

export async function signOutOfHappyView() {
  const session = await getHappyViewSession();
  if (session) {
    await getOAuthClient().revoke(session.did);
  }
  sessionPromise = undefined;
  window.location.replace('/');
}

export async function getAuthenticatedHappyViewClient() {
  const session = await getHappyViewSession();
  if (!session) {
    throw new AppError(AppError.Code.Unauthorized, 'Sign in required');
  }
  return { session, client: new Client(createAgent(session)) };
}
