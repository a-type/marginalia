import * as Highlight from '#/lexicons/com/marginalia/highlight';
import { getCurrentAccountFn } from '#/lib/auth/functions';
import type { DbClient } from '@tanstack/react-db';

import { parseVerseId } from '#/lib/bible/verse';
import type { HighlightRecord } from './collections';
import { formatHighlightRkey, getHighlightCollections } from './collections';
import type { HighlightColor } from './types';

export async function createHighlight(
  dbClient: DbClient,
  input: { verseId: HighlightRecord['verseId']; color: HighlightColor },
): Promise<HighlightRecord> {
  let authorDid: string | null = null;
  try {
    authorDid = (await getCurrentAccountFn())?.did ?? null;
  } catch {
    // Anonymous and offline highlights remain local until a later sync.
  }

  const rkey = formatHighlightRkey(input.verseId);
  const id = authorDid
    ? `at://${authorDid}/${Highlight.$nsid}/${rkey}`
    : `local:${rkey}`;
  const highlight: HighlightRecord = {
    id,
    rkey,
    uri: null,
    cid: null,
    authorDid,
    verseId: input.verseId,
    ...parseVerseId(input.verseId),
    color: input.color,
    createdAt: new Date().toISOString(),
    status: 'pending',
    syncError: null,
  };

  const { highlights } = getHighlightCollections(dbClient);
  await highlights.preload();
  if (highlights.has(id)) {
    const transaction = highlights.update(id, (draft) => {
      Object.assign(draft, highlight);
    });
    await transaction.isPersisted.promise;
  } else {
    await highlights.insert(highlight).isPersisted.promise;
  }
  return highlight;
}
