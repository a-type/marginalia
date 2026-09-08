import type { DbClient } from '@tanstack/react-db';

import type { BibleLocation } from '#/lib/bible/location';
import type { ChapterHighlightSnapshot } from './collections';
import { getHighlightCollections } from './collections';

export async function reconcileChapterHighlights(
  dbClient: DbClient,
  location: BibleLocation,
  snapshot: ChapterHighlightSnapshot,
): Promise<void> {
  const { highlights } = getHighlightCollections(dbClient);
  await highlights.preload();
  const remoteIds = new Set(
    snapshot.highlights.map((highlight) => highlight.id),
  );
  const staleIds = [...highlights.values()]
    .filter(
      (highlight) =>
        highlight.bookId === location.bookId &&
        highlight.chapter === location.chapter &&
        highlight.status === 'synced' &&
        !remoteIds.has(highlight.id),
    )
    .map((highlight) => highlight.id);

  const transaction = dbClient.createTransaction({
    mutationFn: async ({ transaction: pendingTransaction }) => {
      highlights.utils.acceptMutations(pendingTransaction);
    },
  });
  transaction.mutate(() => {
    if (staleIds.length > 0) highlights.delete(staleIds);
    for (const highlight of snapshot.highlights) {
      if (highlights.has(highlight.id)) {
        highlights.update(highlight.id, (draft) =>
          Object.assign(draft, highlight),
        );
      } else {
        highlights.insert(highlight);
      }
    }
  });
  await transaction.isPersisted.promise;
}
