import type { RecordEvent } from '@atproto/tap';
import { assureAdminAuth, parseTapEvent } from '@atproto/tap';

import * as Annotation from '#/lexicons/com/marginalia/annotation';
import * as Commentary from '#/lexicons/com/marginalia/commentary';
import * as Follow from '#/lexicons/com/marginalia/follow';
import * as Highlight from '#/lexicons/com/marginalia/highlight';
import * as Profile from '#/lexicons/com/marginalia/profile';
import { isValidVerseId, parseVerseId } from '#/lib/bible/verse';
import {
  deleteAnnotation,
  deleteCommentary,
  deleteFollow,
  deleteHighlight,
  deleteProfile,
  upsertAnnotation,
  upsertCommentary,
  upsertFollow,
  upsertHighlight,
  upsertProfile,
} from '#/lib/db/queries';
import { AppError } from '#/lib/error';

const supportedCollections = new Set<string>([
  Commentary.$nsid,
  Annotation.$nsid,
  Highlight.$nsid,
  Profile.$nsid,
  Follow.$nsid,
]);

export function authorizeTapWebhook(request: Request) {
  const password = process.env.TAP_ADMIN_PASSWORD;
  if (!password) return;

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    throw new AppError(AppError.Code.Unauthorized, 'Missing Tap authorization');
  }

  try {
    assureAdminAuth(password, authorization);
  } catch (error) {
    throw new AppError(
      AppError.Code.Unauthorized,
      'Invalid Tap authorization',
      error,
    );
  }
}

export async function ingestTapWebhookPayload(payload: unknown) {
  const event = parseTapEvent(payload as Parameters<typeof parseTapEvent>[0]);
  if (event.type !== 'record' || !supportedCollections.has(event.collection)) {
    return { status: 'ignored', eventId: event.id };
  }

  await ingestRecordEvent(event);
  return { status: 'ok', eventId: event.id };
}

async function ingestRecordEvent(event: RecordEvent) {
  if (event.action === 'delete') {
    await deleteRecord(event);
    return;
  }

  if (!event.record) {
    throw new AppError(
      AppError.Code.BadRequest,
      `Tap ${event.action} event is missing a record`,
    );
  }

  if (event.collection === Commentary.$nsid) {
    await persistCommentaryEvent(event);
    return;
  }

  if (event.collection === Annotation.$nsid) {
    await persistAnnotationEvent(event);
    return;
  }

  if (event.collection === Highlight.$nsid) {
    await persistHighlightEvent(event);
    return;
  }

  if (event.collection === Profile.$nsid) {
    await persistProfileEvent(event);
    return;
  }

  if (event.collection === Follow.$nsid) {
    await persistFollowEvent(event);
  }
}

async function persistCommentaryEvent(event: RecordEvent) {
  const record = Commentary.$parse(event.record);
  await upsertCommentary({
    uri: recordUri(event),
    tid: event.rkey,
    cid: event.cid ?? null,
    authorDid: event.did,
    name: record.name,
    recordJson: JSON.stringify(record),
  });
}

async function persistAnnotationEvent(event: RecordEvent) {
  const record = Annotation.$parse(event.record);
  await upsertAnnotation({
    uri: recordUri(event),
    tid: event.rkey,
    cid: event.cid ?? null,
    authorDid: event.did,
    commentaryId: serializeOptionalJson(record.commentaryId),
    verses: record.verses.map((verse) => {
      if (!isValidVerseId(verse.id)) {
        throw new AppError(
          AppError.Code.BadRequest,
          `Invalid verse ID: ${verse.id}`,
        );
      }
      return { verseId: verse.id, ...parseVerseId(verse.id) };
    }),
    comment: record.comment,
    recordJson: JSON.stringify(record),
    createdAt: record.createdAt,
  });
}

async function persistHighlightEvent(event: RecordEvent) {
  const record = Highlight.$parse(event.record);
  if (!isValidVerseId(record.verse.id)) {
    throw new AppError(
      AppError.Code.BadRequest,
      `Invalid verse ID: ${record.verse.id}`,
    );
  }
  await upsertHighlight({
    uri: recordUri(event),
    tid: event.rkey,
    cid: event.cid ?? null,
    authorDid: event.did,
    verse: { verseId: record.verse.id, ...parseVerseId(record.verse.id) },
    color: record.color,
    recordJson: JSON.stringify(record),
    createdAt: record.createdAt,
  });
}

async function persistProfileEvent(event: RecordEvent) {
  const record = Profile.$parse(event.record);
  await upsertProfile({
    uri: recordUri(event),
    cid: event.cid ?? null,
    authorDid: event.did,
    handle: record.handle,
    displayName: record.displayName ?? null,
    avatar: record.avatar ?? null,
    description: record.description ?? null,
    recordJson: JSON.stringify(record),
    createdAt: record.createdAt,
  });
}

async function persistFollowEvent(event: RecordEvent) {
  const record = Follow.$parse(event.record);
  await upsertFollow({
    uri: recordUri(event),
    tid: event.rkey,
    cid: event.cid ?? null,
    authorDid: event.did,
    subject: record.subject,
    recordJson: JSON.stringify(record),
    createdAt: record.createdAt,
  });
}

async function deleteRecord(event: RecordEvent) {
  const uri = recordUri(event);
  if (event.collection === Commentary.$nsid) {
    await deleteCommentary(uri);
  } else if (event.collection === Annotation.$nsid) {
    await deleteAnnotation(uri);
  } else if (event.collection === Highlight.$nsid) {
    await deleteHighlight(uri);
  } else if (event.collection === Profile.$nsid) {
    await deleteProfile(uri);
  } else {
    await deleteFollow(uri);
  }
}

function recordUri(event: RecordEvent) {
  return `at://${event.did}/${event.collection}/${event.rkey}`;
}

function serializeOptionalJson(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}
