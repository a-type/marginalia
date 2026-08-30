import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { oauth } from './atproto.server';
import {
  clearAppSession,
  getAppSession,
  getCurrentAccount,
} from './auth.server';
import { AppError } from './error';

export const loginFn = createServerFn({ method: 'POST' })
  .validator((data: { identifier: string }) => {
    const identifier = data.identifier.trim();
    if (!identifier || identifier.length > 255) {
      throw new AppError(
        AppError.Code.BadRequest,
        'Enter a valid handle, DID, or PDS address',
      );
    }
    return { identifier };
  })
  .handler(async ({ data }) => {
    const url = await oauth.authorize(data.identifier);
    throw redirect({ href: url.href });
  });

export const getCurrentAccountFn = createServerFn({ method: 'GET' }).handler(
  () => getCurrentAccount(),
);

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await getAppSession();
  if (session.data.did) {
    const oauthSession = await oauth.restore(session.data.did);
    await oauthSession.signOut();
  }
  await clearAppSession();
  throw redirect({ to: '/', reloadDocument: true });
});
