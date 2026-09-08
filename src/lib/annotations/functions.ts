import { TID } from '@atproto/common-web';
import { Client } from '@atproto/lex';
import { isValidDid } from '@atproto/syntax';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import * as Annotation from '#/lexicons/com/marginalia/annotation';
import { oauth } from '#/lib/atproto/server';
import { getAppSession } from '#/lib/auth/server';
import { isBookId, isValidVerseId } from '#/lib/bible/verse';
import { getAnnotationsForChapter } from '#/lib/db/queries';
import { AppError } from '#/lib/error';
import { logger } from '#/logger';
import type {
  AnnotationRecord,
  AnnotationVerseRecord,
  ChapterAnnotationSnapshot,
} from './collections';
import { formatAnnotationVerseRecordId } from './collections';

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

async function getAuthenticatedClient() {
  const session = await getAppSession();
  if (!session.data.did) {
    throw new AppError(AppError.Code.Unauthorized, 'Sign in required');
  }
  const oauthSession = await oauth.restore(session.data.did);
  const did = session.data.did;
  if (!isValidDid(did)) {
    throw new AppError(AppError.Code.Unauthorized, 'Invalid DID');
  }
  return { client: new Client(oauthSession), did };
}

export const uploadAnnotationFn = createServerFn({ method: 'POST' })
  .validator(uploadAnnotationSchema)
  .handler(async ({ data }) => {
    const { client } = await getAuthenticatedClient();
    const record = Annotation.$build({
      verses: data.verses.map((id) => ({ id })),
      comment: data.comment,
      createdAt: data.createdAt as Annotation.Main['createdAt'],
    });
    const response = await client.putRecord(record, data.rkey);
    return {
      uri: response.body.uri,
      cid: response.body.cid,
    };
  });

export const listChapterAnnotationsFn = createServerFn({ method: 'GET' })
  .validator(listChapterAnnotationsSchema)
  .handler(async ({ data }): Promise<ChapterAnnotationSnapshot> => {
    const rows = await getAnnotationsForChapter(data.bookId, data.chapter);
    const annotations = new Map<string, AnnotationRecord>();
    const annotationVerses: AnnotationVerseRecord[] = [];
    const ordinals = new Map<string, number>();

    for (const row of rows) {
      if (!isValidVerseId(row.verseId)) {
        logger.warn('Skipping invalid projected annotation verse', row.uri);
        continue;
      }
      const comment = row.comment.trim();

      if (!annotations.has(row.uri)) {
        annotations.set(row.uri, {
          id: row.uri,
          rkey: row.tid,
          uri: row.uri,
          cid: row.cid,
          authorDid: row.authorDid,
          bookId: row.bookId,
          chapter: row.chapter,
          comment,
          createdAt: row.createdAt,
          status: 'synced',
          syncError: null,
        });
      }

      const ordinal = ordinals.get(row.uri) ?? 0;
      annotationVerses.push({
        id: formatAnnotationVerseRecordId(row.uri, row.verseId),
        annotationId: row.uri,
        verseId: row.verseId,
        bookId: row.bookId,
        chapter: row.chapter,
        verse: row.verse,
        ordinal,
      });
      ordinals.set(row.uri, ordinal + 1);
    }

    return {
      annotations: [...annotations.values()],
      annotationVerses,
    };
  });
