import { TID } from '@atproto/common-web';
import { marginsbible } from '@marginsbible/atproto/lexicons';
import type { DbClient } from '@tanstack/react-db';
import { getCurrentUserDid } from '../auth/functions';
import type { VerseId } from '../bible/verse';
import { parseVerseId } from '../bible/verse';
import type { AnnotationRecord } from './collections';
import {
  ensureAnnotationCollectionReady,
  getAnnotationChapterKeys,
  getAnnotationCollections,
} from './collections';

export async function createAnnotation(
  dbClient: DbClient,
  input: { verses: readonly VerseId[]; comment: string; createdAt?: string },
): Promise<AnnotationRecord> {
  const verses = [...new Set(input.verses)];
  if (verses.length === 0) throw new Error('An annotation requires verses');

  const firstVerse = parseVerseId(verses[0]);
  if (
    !verses.every((verseId) => {
      const verse = parseVerseId(verseId);
      return verse.bookId === firstVerse.bookId;
    })
  ) {
    throw new Error('Annotation verses must belong to one book');
  }

  const comment = input.comment.trim();
  if (!comment) throw new Error('An annotation requires a comment');

  let authorDid: string | null = null;
  try {
    authorDid = (await getCurrentUserDid()) ?? null;
  } catch {
    // Anonymous and offline annotations remain local until a later sync.
  }

  const rkey = TID.nextStr();
  const id = authorDid
    ? `at://${authorDid}/${marginsbible.annotation.$nsid}/${rkey}`
    : `local:${rkey}`;
  const annotation: AnnotationRecord = {
    id,
    rkey,
    uri: null,
    cid: null,
    authorDid,
    bookId: firstVerse.bookId,
    chapter: firstVerse.chapter,
    chapterKeys: getAnnotationChapterKeys(verses),
    verses: verses.sort((left, right) => {
      const a = parseVerseId(left);
      const b = parseVerseId(right);
      return a.chapter - b.chapter || a.verse - b.verse;
    }),
    comment,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status: 'pending',
    syncError: null,
  };
  const collections = getAnnotationCollections(dbClient);
  await ensureAnnotationCollectionReady(collections.annotations);
  const transaction = dbClient.createTransaction({
    mutationFn: async ({ transaction: pendingTransaction }) => {
      await collections.annotations.utils.acceptMutations(pendingTransaction);
    },
  });

  transaction.mutate(() => {
    collections.annotations.insert(annotation);
  });
  await transaction.isPersisted.promise;

  return annotation;
}
