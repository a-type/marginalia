import { Client } from '@atproto/lex';
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from '@atproto/oauth-client-node';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { isValidDid } from '@atproto/syntax';
import { sql } from 'kysely';

import { getRequiredClient } from '#/db';
import { getAppSession } from '../auth/server';
import { AppError } from '../error';

const scope = 'atproto transition:generic';
if (!process.env.APP_URL) {
  throw new AppError(
    AppError.Code.InternalServerError,
    'APP_URL environment variable is not set',
  );
}
const appUrl = process.env.APP_URL.replace(/\/$/, '');
const callbackUrl = `${appUrl}/oauth/callback`;
const isLocal = new URL(appUrl).hostname === '127.0.0.1';

class AuthStateStore implements NodeSavedStateStore {
  async get(key: string) {
    const db = await getRequiredClient();
    const state = await db
      .selectFrom('atproto_oauth_states')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();
    return state ? (JSON.parse(state.value) as NodeSavedState) : undefined;
  }

  async set(key: string, value: NodeSavedState) {
    const db = await getRequiredClient();
    await db
      .insertInto('atproto_oauth_states')
      .values({ key, value: JSON.stringify(value) })
      .onConflict((conflict) =>
        conflict.column('key').doUpdateSet({ value: sql`excluded.value` }),
      )
      .execute();
  }

  async del(key: string) {
    const db = await getRequiredClient();
    await db
      .deleteFrom('atproto_oauth_states')
      .where('key', '=', key)
      .execute();
  }
}

class AuthSessionStore implements NodeSavedSessionStore {
  async get(did: string) {
    const db = await getRequiredClient();
    const session = await db
      .selectFrom('atproto_oauth_sessions')
      .select('value')
      .where('did', '=', did)
      .executeTakeFirst();
    return session
      ? (JSON.parse(session.value) as NodeSavedSession)
      : undefined;
  }

  async set(did: string, value: NodeSavedSession) {
    const db = await getRequiredClient();
    await db
      .insertInto('accounts')
      .values({ did })
      .onConflict((conflict) => conflict.column('did').doNothing())
      .execute();
    await db
      .insertInto('atproto_oauth_sessions')
      .values({ did, value: JSON.stringify(value) })
      .onConflict((conflict) =>
        conflict.column('did').doUpdateSet({
          value: sql`excluded.value`,
          updated_at: sql`CURRENT_TIMESTAMP`,
        }),
      )
      .execute();
  }

  async del(did: string) {
    const db = await getRequiredClient();
    await db
      .deleteFrom('atproto_oauth_sessions')
      .where('did', '=', did)
      .execute();
  }
}

const encodedCallback = encodeURIComponent(callbackUrl);
const encodedScope = encodeURIComponent(scope);

export const oauth = new NodeOAuthClient({
  clientMetadata: {
    client_name: 'Marginalia',
    client_uri: appUrl,
    client_id: isLocal
      ? `http://localhost?redirect_uri=${encodedCallback}&scope=${encodedScope}`
      : `${appUrl}/oauth-client-metadata.json`,
    scope,
    redirect_uris: [callbackUrl],
    response_types: ['code'],
    application_type: 'web',
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  },
  stateStore: new AuthStateStore(),
  sessionStore: new AuthSessionStore(),
});

export async function getAuthenticatedClient() {
  const session = await getAppSession();
  const did = session.data.did;
  if (!did || !isValidDid(did)) {
    throw new AppError(AppError.Code.Unauthorized, 'Sign in required');
  }
  const oauthSession = await oauth.restore(did);
  return { client: new Client(oauthSession), did, session: oauthSession };
}
