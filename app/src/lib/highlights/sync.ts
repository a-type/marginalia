import { marginsbible } from '@marginsbible/atproto/lexicons';
import type { DbClient } from '@tanstack/react-db';
import { logger } from '../../logger';
import { happyViewAuthState } from '../atproto/client';
import { AppError } from '../error';
import { formatHighlightRkey, getHighlightCollections } from './collections';
import { deleteHighlight, uploadHighlight } from './functions';

const activeSyncs = new WeakMap<DbClient, Promise<void>>();

async function synchronizeHighlights(dbClient: DbClient, ownerDid: string) {
  if (!navigator.onLine || happyViewAuthState.expiredDid === ownerDid) return;
  const { highlights } = getHighlightCollections(dbClient);
  await highlights.preload();

  for (const highlight of [...highlights.values()]) {
    const current = highlights.get(highlight.id);
    if (current?.authorDid !== null || current.status !== 'pending') continue;
    const id = `at://${ownerDid}/${marginsbible.highlight.$nsid}/${highlight.rkey}`;
    const transaction = dbClient.createTransaction({
      mutationFn: async ({ transaction: pendingTransaction }) => {
        await highlights.utils.acceptMutations(pendingTransaction);
      },
    });
    transaction.mutate(() => {
      highlights.delete(highlight.id);
      highlights.insert({ ...current, id, authorDid: ownerDid });
    });
    await transaction.isPersisted.promise;
  }

  for (const highlight of [...highlights.values()]) {
    const current = highlights.get(highlight.id);
    if (
      !current ||
      current.authorDid !== ownerDid ||
      (current.status !== 'pending' && current.status !== 'deleting')
    )
      continue;
    try {
      if (current.status === 'deleting') {
        if (current.uri) {
          await deleteHighlight({ data: { uri: current.uri } });
          await highlights.update(highlight.id, (draft) => {
            if (draft.status === 'deleting') {
              draft.status = 'deleted';
              draft.syncError = null;
            }
          }).isPersisted.promise;
        } else {
          await highlights.delete(highlight.id).isPersisted.promise;
        }
        continue;
      }
      const remote = await uploadHighlight({
        data: {
          verseId: current.verseId,
          color: current.color,
          createdAt: current.createdAt,
        },
      });
      await highlights.update(highlight.id, (draft) => {
        draft.rkey = formatHighlightRkey(highlight.verseId);
        draft.uri = remote.uri;
        draft.cid = remote.cid;
        if (
          draft.status === 'pending' &&
          draft.createdAt === current.createdAt &&
          draft.color === current.color
        ) {
          draft.status = 'uploaded';
        }
        draft.syncError = null;
      }).isPersisted.promise;
    } catch (error) {
      logger.warn('Highlight sync failed', error);
      if (!highlights.has(highlight.id)) continue;
      await highlights.update(highlight.id, (draft) => {
        draft.syncError =
          error instanceof Error ? error.message : String(error);
      }).isPersisted.promise;
      if (
        AppError.isInstance(error) &&
        error.code === AppError.Code.SessionExpired
      ) {
        return;
      }
    }
  }
}

export function requestHighlightSync(
  dbClient: DbClient,
  ownerDid: string,
): Promise<void> {
  const activeSync = activeSyncs.get(dbClient);
  if (activeSync) {
    return activeSync.then(() => requestHighlightSync(dbClient, ownerDid));
  }
  const sync = synchronizeHighlights(dbClient, ownerDid).finally(() =>
    activeSyncs.delete(dbClient),
  );
  activeSyncs.set(dbClient, sync);
  return sync;
}
