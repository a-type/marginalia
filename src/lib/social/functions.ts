import { TID } from '@atproto/common-web';
import { isValidDid } from '@atproto/syntax';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import * as Follow from '#/lexicons/com/marginalia/follow';
import * as Profile from '#/lexicons/com/marginalia/profile';
import { getAuthenticatedClient } from '#/lib/atproto/server';
import { getCurrentAccount } from '#/lib/auth/server';
import {
  getFollowedDids,
  getProfile,
  getProfilesByDids,
  upsertFollow,
  upsertProfile,
} from '#/lib/db/queries';
import { AppError } from '#/lib/error';

const profileInputSchema = z.object({
  handle: z.string().trim().min(1).max(253),
  displayName: z.string().trim().max(256).optional(),
  avatar: z.url().max(2_048).optional(),
  description: z.string().trim().max(5_000).optional(),
});

const handleInputSchema = z.object({
  handle: z.string().trim().min(1).max(253),
});

interface ActorProfileResponse {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

interface GetFollowsResponse {
  follows?: ActorProfileResponse[];
  cursor?: string;
}

function isActorProfile(value: unknown): value is ActorProfileResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    'did' in value &&
    typeof value.did === 'string' &&
    isValidDid(value.did) &&
    'handle' in value &&
    typeof value.handle === 'string'
  );
}

async function getBlueskyProfile(actor: string) {
  const { session } = await getAuthenticatedClient();
  const response = await session.fetchHandler(
    `/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
  );
  if (!response.ok) return null;
  const profile: unknown = await response.json();
  return isActorProfile(profile) ? profile : null;
}

export const getProfileSetupFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const account = await getCurrentAccount();
    if (!account) return null;

    const [profile, blueskyProfile] = await Promise.all([
      getProfile(account.did),
      getBlueskyProfile(account.did),
    ]);
    return {
      profile,
      seed: {
        handle:
          profile?.handle ?? blueskyProfile?.handle ?? account.handle ?? '',
        displayName: profile?.displayName ?? blueskyProfile?.displayName ?? '',
        avatar: profile?.avatar ?? blueskyProfile?.avatar ?? '',
        description: profile?.description ?? blueskyProfile?.description ?? '',
      },
    };
  },
);

export const saveProfileFn = createServerFn({ method: 'POST' })
  .validator(profileInputSchema)
  .handler(async ({ data }) => {
    const { client, did } = await getAuthenticatedClient();
    const existingProfile = await getProfile(did);
    const createdAt = (existingProfile?.createdAt ??
      new Date().toISOString()) as Profile.Main['createdAt'];
    const record = Profile.$build({
      handle: data.handle as Profile.Main['handle'],
      ...(data.displayName ? { displayName: data.displayName } : {}),
      ...(data.avatar ? { avatar: data.avatar as Profile.Main['avatar'] } : {}),
      ...(data.description ? { description: data.description } : {}),
      createdAt,
    });
    const response = await client.putRecord(record, 'self');
    await upsertProfile({
      uri: response.body.uri,
      cid: response.body.cid,
      authorDid: did,
      handle: data.handle,
      displayName: data.displayName || null,
      avatar: data.avatar || null,
      description: data.description || null,
      recordJson: JSON.stringify(record),
      createdAt,
    });
    return { did };
  });

export const lookupProfileByHandleFn = createServerFn({ method: 'POST' })
  .validator(handleInputSchema)
  .handler(async ({ data }) => {
    const profile = await getBlueskyProfile(data.handle);
    if (!profile) {
      throw new AppError(AppError.Code.NotFound, 'Account not found');
    }
    return profile;
  });

export const followProfileFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ subject: z.string().refine(isValidDid, 'Invalid DID') }),
  )
  .handler(async ({ data }) => {
    const { client, did } = await getAuthenticatedClient();
    if (data.subject === did) {
      throw new AppError(
        AppError.Code.BadRequest,
        'You cannot follow yourself',
      );
    }
    const createdAt = new Date().toISOString() as Follow.Main['createdAt'];
    const rkey = TID.nextStr();
    const record = Follow.$build({
      subject: data.subject,
      createdAt,
    });
    const response = await client.putRecord(record, rkey);
    await upsertFollow({
      uri: response.body.uri,
      tid: rkey,
      cid: response.body.cid,
      authorDid: did,
      subject: data.subject,
      recordJson: JSON.stringify(record),
      createdAt,
    });
    return { subject: data.subject };
  });

export const listFollowSuggestionsFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { did, session } = await getAuthenticatedClient();
  const followedDids = new Set(await getFollowedDids(did));
  const blueskyFollowDids: string[] = [];
  let cursor: string | undefined;

  do {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const response = await session.fetchHandler(
      `/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(did)}&limit=100${suffix}`,
    );
    if (!response.ok) break;
    const page = (await response.json()) as GetFollowsResponse;
    for (const follow of page.follows ?? []) {
      if (isActorProfile(follow)) blueskyFollowDids.push(follow.did);
    }
    cursor = page.cursor;
  } while (cursor);

  const candidates = blueskyFollowDids.filter(
    (candidate) => candidate !== did && !followedDids.has(candidate),
  );
  return getProfilesByDids([...new Set(candidates)]);
});

export const getCurrentProfileFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { did } = await getAuthenticatedClient();
  const profile = await getProfile(did);
  return profile ?? null;
});
