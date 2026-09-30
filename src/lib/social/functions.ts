import { TID } from '@atproto/common-web';
import { isValidDid } from '@atproto/syntax';
import { z } from 'zod';

import * as Follow from '#/lexicons/com/marginalia/follow';
import * as FollowList from '#/lexicons/com/marginalia/follow/list';
import * as Profile from '#/lexicons/com/marginalia/profile';
import * as ProfilesForDids from '#/lexicons/com/marginalia/profile/getForDids';
import * as ProfileList from '#/lexicons/com/marginalia/profile/list';
import {
  getAuthenticatedHappyViewClient,
  getHappyViewSession,
} from '#/lib/atproto/client';
import {
  fetchAllXrpcRecords,
  fetchXrpcRecordPage,
  parseAtRecordUri,
} from '#/lib/atproto/xrpc';
import { AppError } from '#/lib/error';
import { logger } from '#/logger';

const profileInputSchema = z.object({
  handle: z.string().trim().min(1).max(253),
  displayName: z.string().trim().max(256).optional(),
  avatar: z.url().max(2_048).optional(),
  description: z.string().trim().max(5_000).optional(),
});

const handleInputSchema = z.object({
  handle: z.string().trim().min(1).max(253),
});

const followInputSchema = z.object({
  subject: z.string().refine(isValidDid, 'Invalid DID'),
});

const actorProfileSchema = z
  .object({
    did: z.string().refine(isValidDid),
    handle: z.string(),
    displayName: z.string().optional(),
    avatar: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

const happyViewActorProfileSchema = z
  .object({
    did: z.string().refine(isValidDid),
    handle: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    avatarURL: z.string().optional(),
  })
  .passthrough();

const blueskyPublicApi = 'https://public.api.bsky.app';

const followsResponseSchema = z
  .object({
    follows: z.array(z.unknown()).optional(),
    cursor: z.string().optional(),
  })
  .passthrough();

const profileRecordSchema = z
  .object({
    uri: z.string(),
    cid: z.string().nullish(),
    handle: z.string(),
    displayName: z.string().optional(),
    avatar: z.string().optional(),
    description: z.string().optional(),
    createdAt: z.string(),
  })
  .passthrough();

const followRecordSchema = z
  .object({
    uri: z.string(),
    subject: z.string(),
    createdAt: z.string(),
  })
  .passthrough();

export interface SocialProfile {
  uri: string;
  cid: string | null;
  authorDid: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
  description: string | null;
  createdAt: string;
}

export interface ActorProfileResponse {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

type HappyViewSession = NonNullable<
  Awaited<ReturnType<typeof getHappyViewSession>>
>;

async function fetchHappyViewActorProfile(session: HappyViewSession) {
  const response = await session.fetchHandler(
    '/xrpc/app.bsky.actor.getProfile',
    { method: 'GET' },
  );
  if (!response.ok) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `Unable to load the HappyView actor profile (${response.status})`,
    );
  }

  const profile: unknown = await response.json();
  const result = happyViewActorProfileSchema.safeParse(profile);
  if (!result.success) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'HappyView returned an invalid actor profile',
      result.error,
    );
  }

  return {
    did: result.data.did,
    handle: result.data.handle,
    ...(result.data.displayName === undefined
      ? {}
      : { displayName: result.data.displayName }),
    ...(result.data.avatarURL === undefined
      ? {}
      : { avatar: result.data.avatarURL }),
    ...(result.data.description === undefined
      ? {}
      : { description: result.data.description }),
  } satisfies ActorProfileResponse;
}

async function fetchPublicBlueskyProfile(actor: string) {
  const query = new URLSearchParams({ actor });
  const response = await fetch(
    new URL(`/xrpc/app.bsky.actor.getProfile?${query}`, blueskyPublicApi),
  );
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `Unable to load the Bluesky profile (${response.status})`,
    );
  }

  const profile: unknown = await response.json();
  const result = actorProfileSchema.safeParse(profile);
  if (!result.success) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Bluesky returned an invalid actor profile',
      result.error,
    );
  }
  return result.data;
}

export async function getCurrentBlueskyProfileFn() {
  const session = await getHappyViewSession();
  if (!session) return null;
  if (!isValidDid(session.did)) {
    throw new AppError(AppError.Code.Unauthorized, 'Invalid HappyView session');
  }
  return fetchHappyViewActorProfile(session);
}

function parseProfile(candidate: unknown): SocialProfile | null {
  const result = profileRecordSchema.safeParse(candidate);
  if (!result.success) {
    logger.warn('Skipping malformed HappyView profile record', candidate);
    return null;
  }

  const uriParts = parseAtRecordUri(result.data.uri, Profile.$nsid);
  if (!uriParts) {
    logger.warn(
      'Skipping HappyView profile with invalid AT URI',
      result.data.uri,
    );
    return null;
  }

  let record: Profile.Main;
  try {
    record = Profile.$parse(result.data);
  } catch (error) {
    logger.warn(
      'Skipping invalid HappyView profile record',
      result.data.uri,
      error,
    );
    return null;
  }

  return {
    uri: result.data.uri,
    cid: result.data.cid ?? null,
    authorDid: uriParts.authorDid,
    handle: record.handle,
    displayName: record.displayName ?? null,
    avatar: record.avatar ?? null,
    description: record.description ?? null,
    createdAt: record.createdAt,
  };
}

async function getProfileForDid(session: HappyViewSession, did: string) {
  const records = await fetchAllXrpcRecords(session, ProfileList.$nsid, {
    did,
  });
  return (
    records.map(parseProfile).find((profile) => profile?.authorDid === did) ??
    null
  );
}

async function getProfilesByDids(
  session: HappyViewSession,
  dids: readonly string[],
) {
  const uniqueDids = [...new Set(dids)];
  const profiles: SocialProfile[] = [];

  for (let offset = 0; offset < uniqueDids.length; offset += 100) {
    const batch = uniqueDids.slice(offset, offset + 100);
    const page = await fetchXrpcRecordPage(session, ProfilesForDids.$nsid, {
      dids: batch.join(','),
    });
    for (const candidate of page.records) {
      const profile = parseProfile(candidate);
      if (profile) profiles.push(profile);
    }
  }

  return profiles;
}

async function getFollowedDids(session: HappyViewSession, authorDid: string) {
  const records = await fetchAllXrpcRecords(session, FollowList.$nsid, {
    did: authorDid,
  });
  const followedDids = new Set<string>();

  for (const candidate of records) {
    const result = followRecordSchema.safeParse(candidate);
    if (!result.success) {
      logger.warn('Skipping malformed HappyView follow record', candidate);
      continue;
    }
    if (!parseAtRecordUri(result.data.uri, Follow.$nsid)) {
      logger.warn(
        'Skipping HappyView follow with invalid AT URI',
        result.data.uri,
      );
      continue;
    }

    try {
      const record = Follow.$parse(result.data);
      followedDids.add(record.subject);
    } catch (error) {
      logger.warn(
        'Skipping invalid HappyView follow record',
        result.data.uri,
        error,
      );
    }
  }

  return followedDids;
}

async function getBlueskyFollowDids(did: string) {
  const followedDids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null | undefined;

  while (cursor !== null) {
    const query = new URLSearchParams({ actor: did, limit: '100' });
    if (cursor) query.set('cursor', cursor);
    // Bluesky's public AppView serves graph queries; HappyView only routes loaded lexicons.
    const url = new URL(
      `/xrpc/app.bsky.graph.getFollows?${query.toString()}`,
      blueskyPublicApi,
    );
    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(
        AppError.Code.ExternalServiceError,
        `Unable to load Bluesky follows (${response.status})`,
      );
    }

    const body: unknown = await response.json();
    const page = followsResponseSchema.safeParse(body);
    if (!page.success) {
      throw new AppError(
        AppError.Code.ExternalServiceError,
        'The ATProto server returned an invalid follow list',
        page.error,
      );
    }

    for (const candidate of page.data.follows ?? []) {
      const follow = actorProfileSchema.safeParse(candidate);
      if (follow.success) {
        followedDids.add(follow.data.did);
      } else {
        logger.warn('Skipping invalid ATProto follow profile', candidate);
      }
    }

    if (!page.data.cursor) {
      cursor = null;
      continue;
    }
    if (cursors.has(page.data.cursor)) {
      throw new AppError(
        AppError.Code.ExternalServiceError,
        'The ATProto server returned a repeated follow cursor',
      );
    }
    cursors.add(page.data.cursor);
    cursor = page.data.cursor;
  }

  return followedDids;
}

export async function getProfileSetupFn(expectedDid: string) {
  const session = await getHappyViewSession();
  if (!session || !isValidDid(session.did) || session.did !== expectedDid) {
    throw new AppError(AppError.Code.Unauthorized, 'Invalid HappyView session');
  }

  const [profile, actorProfile] = await Promise.all([
    getProfileForDid(session, session.did),
    fetchHappyViewActorProfile(session),
  ]);

  return {
    profile,
    seed: {
      handle: profile?.handle ?? actorProfile.handle,
      displayName: profile?.displayName ?? actorProfile.displayName ?? '',
      avatar: profile?.avatar ?? actorProfile.avatar ?? '',
      description: profile?.description ?? actorProfile.description ?? '',
    },
  };
}

export async function saveProfileFn({ data }: { data: unknown }) {
  const input = profileInputSchema.parse(data);
  const { session, client } = await getAuthenticatedHappyViewClient();
  const existingProfile = await getProfileForDid(session, session.did);
  const createdAt = (existingProfile?.createdAt ??
    new Date().toISOString()) as Profile.Main['createdAt'];
  const record = Profile.$build({
    handle: input.handle as Profile.Main['handle'],
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.avatar ? { avatar: input.avatar as Profile.Main['avatar'] } : {}),
    ...(input.description ? { description: input.description } : {}),
    createdAt,
  });
  const response = await client.putRecord(record, 'self');
  return { did: session.did, uri: response.body.uri, cid: response.body.cid };
}

export async function lookupProfileByHandleFn({ data }: { data: unknown }) {
  const input = handleInputSchema.parse(data);
  const profile = await fetchPublicBlueskyProfile(input.handle);
  if (!profile) {
    throw new AppError(AppError.Code.NotFound, 'Account not found');
  }
  return profile;
}

export async function followProfileFn({ data }: { data: unknown }) {
  const input = followInputSchema.parse(data);
  const { session, client } = await getAuthenticatedHappyViewClient();
  if (input.subject === session.did) {
    throw new AppError(AppError.Code.BadRequest, 'You cannot follow yourself');
  }

  const followedDids = await getFollowedDids(session, session.did);
  if (followedDids.has(input.subject)) return { subject: input.subject };

  const record = Follow.$build({
    subject: input.subject,
    createdAt: new Date().toISOString() as Follow.Main['createdAt'],
  });
  await client.putRecord(record, TID.nextStr());
  return { subject: input.subject };
}

export async function listFollowSuggestionsFn() {
  const session = await getHappyViewSession();
  if (!session) return [];

  const [followedDids, blueskyFollowDids] = await Promise.all([
    getFollowedDids(session, session.did),
    getBlueskyFollowDids(session.did),
  ]);
  const candidateDids = [...blueskyFollowDids].filter(
    (did) => did !== session.did && !followedDids.has(did),
  );
  return getProfilesByDids(session, candidateDids);
}

export async function getCurrentProfileFn() {
  const session = await getHappyViewSession();
  if (!session) return null;
  return getProfileForDid(session, session.did);
}
