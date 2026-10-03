import type { DbClient } from '@tanstack/react-db';

import * as Highlight from '#/lexicons/com/apostilbible/highlight';
import { formatHighlightRkey, getHighlightCollections } from './collections';
import { uploadHighlight } from './functions';

const activeSyncs = new WeakMap<DbClient, Promise<void>>();

async function synchronizeHighlights(dbClient: DbClient, ownerDid: string) {
  if (!navigator.onLine) return;
  const { highlights } = getHighlightCollections(dbClient);
  await highlights.preload();

  for (const highlight of [...highlights.values()]) {
    if (highlight.authorDid !== null || highlight.status !== 'pending')
      continue;
    const id = `at://${ownerDid}/${Highlight.$nsid}/${highlight.rkey}`;
    const transaction = highlights.delete(highlight.id);
    await transaction.isPersisted.promise;
    await highlights.insert({ ...highlight, id, authorDid: ownerDid })
      .isPersisted.promise;
  }

  for (const highlight of [...highlights.values()]) {
    if (highlight.authorDid !== ownerDid || highlight.status !== 'pending')
      continue;
    try {
      const remote = await uploadHighlight({
        data: {
          verseId: highlight.verseId,
          color: highlight.color,
          createdAt: highlight.createdAt,
        },
      });
      await highlights.update(highlight.id, (draft) => {
        draft.rkey = formatHighlightRkey(highlight.verseId);
        draft.uri = remote.uri;
        draft.cid = remote.cid;
        draft.status = 'uploaded';
        draft.syncError = null;
      }).isPersisted.promise;
    } catch (error) {
      await highlights.update(highlight.id, (draft) => {
        draft.syncError =
          error instanceof Error ? error.message : String(error);
      }).isPersisted.promise;
    }
  }
}

export function requestHighlightSync(dbClient: DbClient, ownerDid: string) {
  const activeSync = activeSyncs.get(dbClient);
  if (activeSync) return activeSync;
  const sync = synchronizeHighlights(dbClient, ownerDid).finally(() =>
    activeSyncs.delete(dbClient),
  );
  activeSyncs.set(dbClient, sync);
  return sync;
}
