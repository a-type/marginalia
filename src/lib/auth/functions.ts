import { z } from 'zod';

import { isValidDid } from '@atproto/syntax';

import {
  getHappyViewSession,
  signInToHappyView,
  signOutOfHappyView,
} from '#/lib/atproto/client';
import { AppError } from '#/lib/error';

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter a valid handle, DID, or PDS address')
    .max(255, 'Enter a valid handle, DID, or PDS address'),
});

export async function loginFn({ data }: { data: unknown }) {
  const { identifier } = loginSchema.parse(data);
  await signInToHappyView(identifier);
}

export async function getCurrentUserDidFn(): Promise<string | null> {
  const session = await getHappyViewSession();
  if (!session) return null;
  if (!isValidDid(session.did)) {
    throw new AppError(AppError.Code.Unauthorized, 'Invalid HappyView session');
  }
  return session.did;
}

export async function logoutFn() {
  await signOutOfHappyView();
}
