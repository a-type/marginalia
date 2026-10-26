import { TID } from '@atproto/common-web';
import { z } from 'zod';

import * as Annotation from '#/lexicons/com/marginsbible/annotation';
import * as ListAnnotationsForChapter from '#/lexicons/com/marginsbible/annotation/listForChapter';
import * as ListMyAnnotations from '#/lexicons/com/marginsbible/annotation/listMine';
import {
  getAuthenticatedHappyViewClient,
  getHappyViewSession,
} from '#/lib/atproto/client';
import { fetchXrpcRecordPage, parseAtRecordUri } from '#/lib/atproto/xrpc';
import type { BibleLocation } from '#/lib/bible/location';
import type { VerseId } from '#/lib/bible/verse';
import { isBookId, isValidVerseId, parseVerseId } from '#/lib/bible/verse';
import { logger } from '#/logger';
import type {
  AnnotationRecord,
  AnnotationSyncPage,
  ChapterAnnotationSnapshot,
} from './collections';
import { getAnnotationChapterKeys } from './collections';

const uploadAnnotationSchema = z.object({
  rkey: z.string().refine(TID.is, 'Invalid annotation key'),
  verses: z
    .array(z.string().refine(isValidVerseId, 'Invalid annotation verse'))
    .min(1, 'Invalid annotation verses'),
  comment: z.string().trim().min(1, 'Annotation requires a comment'),
  createdAt: z
    .string()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Invalid annotation date',
    ),
});

export type UploadAnnotationInput = z.input<typeof uploadAnnotationSchema>;

const listChapterAnnotationsSchema = z.object({
  bookId: z.string().refine(isBookId, 'Invalid book ID'),
  chapter: z.number().int().positive(),
});

const listMyAnnotationsSchema = z.object({
  cursor: z.string().optional(),
});

const remoteAnnotationSchema = z
  .object({
    uri: z.string(),
    cid: z.string().nullish(),
    verses: z.array(z.object({ id: z.string() })),
    comment: z.string(),
    createdAt: z.string(),
  })
  .passthrough();

export async function uploadAnnotation({
  data,
}: {
  data: UploadAnnotationInput;
}) {
  const input = uploadAnnotationSchema.parse(data);
  const { client } = await getAuthenticatedHappyViewClient();
  const record = Annotation.$build({
    verses: input.verses.map((id) => ({ id })),
    comment: input.comment,
    createdAt: input.createdAt as Annotation.Main['createdAt'],
  });
  const response = await client.putRecord(record, input.rkey);
  return {
    uri: response.body.uri,
    cid: response.body.cid,
  };
}

export async function listChapterAnnotations({
  data,
}: {
  data: z.input<typeof listChapterAnnotationsSchema>;
}): Promise<ChapterAnnotationSnapshot> {
  const location = listChapterAnnotationsSchema.parse(data);
  const session = await getHappyViewSession();
  if (!session) return { annotations: [] };

  const page = await fetchXrpcRecordPage(
    session,
    ListAnnotationsForChapter.$nsid,
    {
      bookId: location.bookId,
      chapter: String(location.chapter),
    },
  );
  return parseAnnotationRecords(page.records, location);
}

export async function listMyAnnotationsPage({
  data,
}: {
  data: z.input<typeof listMyAnnotationsSchema>;
}): Promise<AnnotationSyncPage> {
  const { cursor } = listMyAnnotationsSchema.parse(data);
  const session = await getHappyViewSession();
  if (!session) return { annotations: [] };

  const page = await fetchXrpcRecordPage(session, ListMyAnnotations.$nsid, {
    limit: '100',
    ...(cursor ? { cursor } : {}),
  });
  const snapshot = parseAnnotationRecords(page.records, undefined, session.did);
  return { ...snapshot, cursor: page.cursor };
}

function parseAnnotationRecords(
  candidates: unknown[],
  location?: BibleLocation,
  expectedAuthorDid?: string,
): ChapterAnnotationSnapshot {
  const annotations = new Map<string, AnnotationRecord>();

  for (const candidate of candidates) {
    const parsed = remoteAnnotationSchema.safeParse(candidate);
    if (!parsed.success) {
      logger.warn('Skipping malformed HappyView annotation record', candidate);
      continue;
    }

    const uriParts = parseAtRecordUri(parsed.data.uri, Annotation.$nsid);
    if (!uriParts) {
      logger.warn(
        'Skipping HappyView annotation with invalid AT URI',
        parsed.data.uri,
      );
      continue;
    }
    if (expectedAuthorDid && uriParts.authorDid !== expectedAuthorDid) {
      logger.warn(
        'Skipping HappyView annotation from an unexpected author',
        parsed.data.uri,
      );
      continue;
    }

    let record: Annotation.Main;
    try {
      record = Annotation.$parse(parsed.data);
    } catch (error) {
      logger.warn(
        'Skipping invalid HappyView annotation record',
        parsed.data.uri,
        error,
      );
      continue;
    }

    const comment = record.comment.trim();
    if (!comment) {
      logger.warn(
        'Skipping HappyView annotation with an empty comment',
        parsed.data.uri,
      );
      continue;
    }

    const verses = new Map<VerseId, ReturnType<typeof parseVerseId>>();
    for (const verse of record.verses) {
      const verseId = verse.id;
      if (!isValidVerseId(verseId)) {
        logger.warn(
          'Skipping invalid verse in HappyView annotation',
          parsed.data.uri,
          verseId,
        );
        continue;
      }
      const parsedVerse = parseVerseId(verseId);
      if (
        !location ||
        (parsedVerse.bookId === location.bookId &&
          parsedVerse.chapter === location.chapter)
      ) {
        verses.set(verseId, parsedVerse);
      }
    }

    if (verses.size === 0) continue;
    const firstVerse = verses.values().next().value;
    if (!firstVerse) continue;
    const orderedVerses = [...verses.entries()]
      .sort(([, left], [, right]) => left.verse - right.verse)
      .map(([verseId]) => verseId);

    annotations.set(parsed.data.uri, {
      id: parsed.data.uri,
      rkey: uriParts.rkey,
      uri: parsed.data.uri,
      cid: parsed.data.cid ?? null,
      authorDid: uriParts.authorDid,
      bookId: location?.bookId ?? firstVerse.bookId,
      chapter: location?.chapter ?? firstVerse.chapter,
      chapterKeys: getAnnotationChapterKeys(orderedVerses),
      verses: orderedVerses,
      comment,
      createdAt: record.createdAt,
      status: 'synced',
      syncError: null,
    });
  }

  return {
    annotations: [...annotations.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    ),
  };
}
