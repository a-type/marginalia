import { Client } from '@atproto/lex';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import * as Highlight from '#/lexicons/com/marginalia/highlight';
import { oauth } from '#/lib/atproto/server';
import { getAppSession } from '#/lib/auth/server';
import { isBookId, isValidVerseId, parseVerseId } from '#/lib/bible/verse';
import { getHighlightsForChapter } from '#/lib/db/queries';
import { AppError } from '#/lib/error';
import type { ChapterHighlightSnapshot, HighlightRecord } from './collections';
import { formatHighlightRkey } from './collections';
import { highlightColors } from './types';

const uploadHighlightSchema = z.object({
  verseId: z.string().refine(isValidVerseId, 'Invalid highlight verse'),
  color: z.enum(highlightColors),
  createdAt: z
    .string()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Invalid highlight date',
    ),
});

const listChapterHighlightsSchema = z.object({
  bookId: z.string().refine(isBookId, 'Invalid book ID'),
  chapter: z.number().int().positive(),
});

export const uploadHighlightFn = createServerFn({ method: 'POST' })
  .validator(uploadHighlightSchema)
  .handler(async ({ data }) => {
    const session = await getAppSession();
    if (!session.data.did) {
      throw new AppError(AppError.Code.Unauthorized, 'Sign in required');
    }
    const client = new Client(await oauth.restore(session.data.did));
    const record = Highlight.$build({
      verse: { id: data.verseId },
      color: data.color,
      createdAt: data.createdAt as Highlight.Main['createdAt'],
    });
    const response = await client.putRecord(
      record,
      formatHighlightRkey(data.verseId),
    );
    return { uri: response.body.uri, cid: response.body.cid };
  });

export const listChapterHighlightsFn = createServerFn({ method: 'GET' })
  .validator(listChapterHighlightsSchema)
  .handler(async ({ data }): Promise<ChapterHighlightSnapshot> => {
    const session = await getAppSession();
    if (!session.data.did) return { highlights: [] };
    const rows = await getHighlightsForChapter(
      session.data.did,
      data.bookId,
      data.chapter,
    );
    const highlights: HighlightRecord[] = rows.flatMap((row) => {
      if (
        !isValidVerseId(row.verseId) ||
        !highlightColors.includes(row.color as HighlightRecord['color'])
      ) {
        return [];
      }
      return [
        {
          id: row.uri,
          rkey: row.rkey,
          uri: row.uri,
          cid: row.cid,
          authorDid: row.authorDid,
          verseId: row.verseId,
          ...parseVerseId(row.verseId),
          color: row.color as HighlightRecord['color'],
          createdAt: row.createdAt,
          status: 'synced',
          syncError: null,
        },
      ];
    });
    return { highlights };
  });
