import * as Annotation from '#/lexicons/com/marginsbible/annotation';
import { getCurrentUserDid } from '#/lib/auth/functions';
import type { VerseId } from '#/lib/bible/verse';
import { parseVerseId } from '#/lib/bible/verse';
import { TID } from '@atproto/common-web';
import type { DbClient } from '@tanstack/react-db';
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
      return (
        verse.bookId === firstVerse.bookId &&
        verse.chapter === firstVerse.chapter
      );
    })
  ) {
    throw new Error('Annotation verses must belong to one chapter');
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
    ? `at://${authorDid}/${Annotation.$nsid}/${rkey}`
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
    verses: verses.sort(
      (left, right) => parseVerseId(left).verse - parseVerseId(right).verse,
    ),
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
