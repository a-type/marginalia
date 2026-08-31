import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { oauth } from '../atproto/server';
import { clearAppSession, getAppSession, getCurrentAccount } from './server';

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter a valid handle, DID, or PDS address')
    .max(255, 'Enter a valid handle, DID, or PDS address'),
});

export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
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
