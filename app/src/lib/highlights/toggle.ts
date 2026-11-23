import type { DbClient } from '@tanstack/react-db';

import type { VerseId } from '../bible/verse';
import { getHighlightCollections } from './collections';
import { createHighlight } from './create';

export async function toggleHighlight(dbClient: DbClient, verseId: VerseId) {
  const { highlights } = getHighlightCollections(dbClient);
  await highlights.preload();
  const applied = [...highlights.values()].filter(
    (highlight) =>
      highlight.verseId === verseId &&
      highlight.status !== 'deleting' &&
      highlight.status !== 'deleted',
  );
  if (applied.length === 0) {
    await createHighlight(dbClient, { verseId, color: 'lemon' });
    return;
  }

  for (const highlight of applied) {
    if (highlight.authorDid) {
      await highlights.update(highlight.id, (draft) => {
        draft.status = 'deleting';
        draft.syncError = null;
      }).isPersisted.promise;
    } else {
      await highlights.delete(highlight.id).isPersisted.promise;
    }
  }
}
