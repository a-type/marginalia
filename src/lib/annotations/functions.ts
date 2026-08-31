import { TID } from '@atproto/common-web';
import { Client } from '@atproto/lex';
import { AtUri, isValidDid } from '@atproto/syntax';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import * as Annotation from '#/lexicons/com/marginalia/annotation';
import type {
  AnnotationColor,
  RemoteAnnotation,
} from '#/lib/annotations/types';
import { annotationColors } from '#/lib/annotations/types';
import { oauth } from '#/lib/atproto/server';
import { getAppSession } from '#/lib/auth/server';
import { isValidVerseId } from '#/lib/bible/verse';
import { AppError } from '#/lib/error';
import { logger } from '#/logger';

const uploadAnnotationSchema = z
  .object({
    rkey: z.string().refine(TID.is, 'Invalid annotation key'),
    verses: z
      .array(z.string().refine(isValidVerseId, 'Invalid annotation verse'))
      .min(1, 'Invalid annotation verses'),
    comment: z.string().trim().optional(),
    color: z.enum(annotationColors).optional(),
    createdAt: z
      .string()
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        'Invalid annotation date',
      ),
  })
  .superRefine((value, context) => {
    if (value.comment || value.color) return;
    context.addIssue({
      code: 'custom',
      message: 'Annotation requires a comment or color',
    });
  })
  .transform((value) => ({
    ...value,
    ...(value.comment ? { comment: value.comment } : { comment: undefined }),
  }));

export type UploadAnnotationInput = z.input<typeof uploadAnnotationSchema>;

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
      ...(data.comment ? { comment: data.comment } : {}),
      ...(data.color ? { color: data.color } : {}),
      createdAt: data.createdAt as Annotation.Main['createdAt'],
    });
    const response = await client.putRecord(record, data.rkey);
    return {
      uri: response.body.uri,
      cid: response.body.cid,
    };
  });

export const listOwnAnnotationsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { client, did } = await getAuthenticatedClient();
    const annotations: RemoteAnnotation[] = [];
    let cursor: string | undefined;

    do {
      const response = await client.listRecords(Annotation.$nsid, {
        repo: did,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      cursor = response.body.cursor;

      for (const item of response.body.records) {
        try {
          const record = Annotation.$parse(item.value);
          const verses = record.verses.map(({ id }) => {
            if (!isValidVerseId(id)) throw new Error(`Invalid verse ID: ${id}`);
            return id;
          });
          if (verses.length === 0) throw new Error('Annotation has no verses');
          const color = annotationColors.includes(
            record.color as AnnotationColor,
          )
            ? (record.color as AnnotationColor)
            : undefined;
          if (!record.comment?.trim() && !color) {
            throw new Error('Annotation has no content');
          }
          annotations.push({
            rkey: new AtUri(item.uri).rkey,
            uri: item.uri,
            cid: item.cid,
            verses,
            ...(record.comment ? { comment: record.comment } : {}),
            ...(color ? { color } : {}),
            createdAt: record.createdAt,
          });
        } catch (error) {
          logger.warn('Skipping invalid remote annotation', item.uri, error);
        }
      }
    } while (cursor);

    return annotations;
  },
);
