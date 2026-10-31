import { marginsbible, type Highlight } from '@marginsbible/atproto/lexicons';
import { z } from 'zod';
import { logger } from '../../logger';
import {
  getAuthenticatedHappyViewClient,
  getHappyViewSession,
} from '../atproto/client';
import { fetchXrpcRecordPage, parseAtRecordUri } from '../atproto/xrpc';
import { isBookId, isValidVerseId, parseVerseId } from '../bible/verse';
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

const remoteHighlightSchema = z
  .object({
    uri: z.string(),
    cid: z.string().nullish(),
    verse: z.object({ id: z.string() }),
    color: z.string(),
    createdAt: z.string(),
  })
  .passthrough();

export async function uploadHighlight({
  data,
}: {
  data: z.input<typeof uploadHighlightSchema>;
}) {
  const input = uploadHighlightSchema.parse(data);
  const { client } = await getAuthenticatedHappyViewClient();
  const record = marginsbible.highlight.$build({
    verse: { id: input.verseId },
    color: input.color,
    createdAt: input.createdAt as Highlight['createdAt'],
  });
  const response = await client.putRecord(
    record,
    formatHighlightRkey(input.verseId),
  );
  return { uri: response.body.uri, cid: response.body.cid };
}

export async function listChapterHighlights({
  data,
}: {
  data: z.input<typeof listChapterHighlightsSchema>;
}): Promise<ChapterHighlightSnapshot> {
  const location = listChapterHighlightsSchema.parse(data);
  const session = await getHappyViewSession();
  if (!session) return { highlights: [] };

  const page = await fetchXrpcRecordPage(
    session,
    marginsbible.highlight.listForChapter.$nsid,
    {
      bookId: location.bookId,
      chapter: String(location.chapter),
    },
  );
  const highlights: HighlightRecord[] = [];

  for (const candidate of page.records) {
    const parsed = remoteHighlightSchema.safeParse(candidate);
    if (!parsed.success) {
      logger.warn('Skipping malformed HappyView highlight record', candidate);
      continue;
    }

    const uriParts = parseAtRecordUri(
      parsed.data.uri,
      marginsbible.highlight.$nsid,
    );
    if (!uriParts) {
      logger.warn(
        'Skipping HappyView highlight with invalid AT URI',
        parsed.data.uri,
      );
      continue;
    }

    let record;
    try {
      record = marginsbible.highlight.$parse(parsed.data);
    } catch (error) {
      logger.warn(
        'Skipping invalid HappyView highlight record',
        parsed.data.uri,
        error,
      );
      continue;
    }

    if (!isValidVerseId(record.verse.id)) {
      logger.warn(
        'Skipping invalid verse in HappyView highlight',
        parsed.data.uri,
      );
      continue;
    }
    const verse = parseVerseId(record.verse.id);
    const color = highlightColors.find(
      (candidateColor) => candidateColor === record.color,
    );
    if (
      verse.bookId !== location.bookId ||
      verse.chapter !== location.chapter ||
      !color
    ) {
      continue;
    }

    highlights.push({
      id: parsed.data.uri,
      rkey: uriParts.rkey,
      uri: parsed.data.uri,
      cid: parsed.data.cid ?? null,
      authorDid: uriParts.authorDid,
      verseId: record.verse.id,
      ...verse,
      color,
      createdAt: record.createdAt,
      status: 'synced',
      syncError: null,
    });
  }

  return { highlights };
}
