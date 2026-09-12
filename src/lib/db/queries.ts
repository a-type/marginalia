import { sql } from 'kysely';

import { getRequiredClient } from '#/db';

interface RecordMetadata {
  uri: string;
  tid: string;
  cid: string | null;
  authorDid: string;
  recordJson: string;
}

export interface UpsertCommentaryInput extends RecordMetadata {
  name: string;
}

export interface AnnotationVerseInput {
  verseId: string;
  bookId: string;
  chapter: number;
  verse: number;
}

export interface UpsertAnnotationInput extends RecordMetadata {
  commentaryId: string | null;
  verses: readonly AnnotationVerseInput[];
  comment: string | null;
  createdAt: string;
}

export interface UpsertHighlightInput extends RecordMetadata {
  verse: AnnotationVerseInput;
  color: string;
  createdAt: string;
}

export interface UpsertProfileInput extends Omit<RecordMetadata, 'tid'> {
  handle: string;
  displayName: string | null;
  avatar: string | null;
  description: string | null;
  createdAt: string;
}

export interface UpsertFollowInput extends RecordMetadata {
  subject: string;
  createdAt: string;
}

export async function upsertCommentary(input: UpsertCommentaryInput) {
  const db = await getRequiredClient();

  await db
    .insertInto('com_marginalia_commentary')
    .values(input)
    .onConflict((conflict) =>
      conflict.column('uri').doUpdateSet({
        tid: sql`excluded.tid`,
        cid: sql`excluded.cid`,
        authorDid: sql`excluded.authorDid`,
        name: sql`excluded.name`,
        recordJson: sql`excluded.recordJson`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }),
    )
    .execute();
}

export async function upsertAnnotation(input: UpsertAnnotationInput) {
  const db = await getRequiredClient();
  const { verses, ...annotation } = input;

  await db.transaction().execute(async (transaction) => {
    await transaction
      .insertInto('com_marginalia_annotation')
      .values(annotation)
      .onConflict((conflict) =>
        conflict.column('uri').doUpdateSet({
          tid: sql`excluded.tid`,
          cid: sql`excluded.cid`,
          authorDid: sql`excluded.authorDid`,
          commentaryId: sql`excluded.commentaryId`,
          comment: sql`excluded.comment`,
          recordJson: sql`excluded.recordJson`,
          createdAt: sql`excluded.createdAt`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        }),
      )
      .execute();

    await transaction
      .deleteFrom('com_marginalia_annotation_verse')
      .where('annotationUri', '=', annotation.uri)
      .execute();

    const uniqueVerses = [
      ...new Map(verses.map((verse) => [verse.verseId, verse])).values(),
    ];
    if (uniqueVerses.length > 0) {
      await transaction
        .insertInto('com_marginalia_annotation_verse')
        .values(
          uniqueVerses.map((verse) => ({
            annotationUri: annotation.uri,
            ...verse,
          })),
        )
        .execute();
    }
  });
}

export async function upsertHighlight(input: UpsertHighlightInput) {
  const db = await getRequiredClient();
  const { verse, ...highlight } = input;
  await db
    .insertInto('com_marginalia_highlight')
    .values({ ...highlight, ...verse, rkey: input.tid })
    .onConflict((conflict) =>
      conflict.column('uri').doUpdateSet({
        rkey: sql`excluded.rkey`,
        cid: sql`excluded.cid`,
        authorDid: sql`excluded.authorDid`,
        verseId: sql`excluded.verseId`,
        bookId: sql`excluded.bookId`,
        chapter: sql`excluded.chapter`,
        verse: sql`excluded.verse`,
        color: sql`excluded.color`,
        recordJson: sql`excluded.recordJson`,
        createdAt: sql`excluded.createdAt`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }),
    )
    .execute();
}

export async function upsertProfile(input: UpsertProfileInput) {
  const db = await getRequiredClient();
  await db
    .insertInto('com_marginalia_profile')
    .values(input)
    .onConflict((conflict) =>
      conflict.column('authorDid').doUpdateSet({
        uri: sql`excluded.uri`,
        cid: sql`excluded.cid`,
        handle: sql`excluded.handle`,
        displayName: sql`excluded.displayName`,
        avatar: sql`excluded.avatar`,
        description: sql`excluded.description`,
        recordJson: sql`excluded.recordJson`,
        createdAt: sql`excluded.createdAt`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }),
    )
    .execute();
}

export async function upsertFollow(input: UpsertFollowInput) {
  const db = await getRequiredClient();
  await db
    .insertInto('com_marginalia_follow')
    .values(input)
    .onConflict((conflict) =>
      conflict.columns(['authorDid', 'subject']).doUpdateSet({
        uri: sql`excluded.uri`,
        tid: sql`excluded.tid`,
        cid: sql`excluded.cid`,
        recordJson: sql`excluded.recordJson`,
        createdAt: sql`excluded.createdAt`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }),
    )
    .execute();
}

export async function getAnnotationsForChapter(
  viewerDid: string | null,
  bookId: string,
  chapter: number,
) {
  if (!viewerDid) return [];
  const db = await getRequiredClient();
  // TODO: fold into main query via join?
  const followedRows = await db
    .selectFrom('com_marginalia_follow')
    .select('subject')
    .where('authorDid', '=', viewerDid)
    .execute();
  const visibleAuthorDids = [
    viewerDid,
    ...followedRows.map((follow) => follow.subject),
  ];
  return db
    .selectFrom('com_marginalia_annotation as annotation')
    .innerJoin(
      'com_marginalia_annotation_verse as verse',
      'verse.annotationUri',
      'annotation.uri',
    )
    .selectAll('annotation')
    .select(['verse.verseId', 'verse.bookId', 'verse.chapter', 'verse.verse'])
    .where('annotation.authorDid', 'in', visibleAuthorDids)
    .where('verse.bookId', '=', bookId)
    .where('verse.chapter', '=', chapter)
    .orderBy('annotation.createdAt', 'desc')
    .orderBy('verse.verse', 'asc')
    .execute();
}

export async function getProfile(authorDid: string) {
  const db = await getRequiredClient();
  return db
    .selectFrom('com_marginalia_profile')
    .selectAll()
    .where('authorDid', '=', authorDid)
    .executeTakeFirst();
}

export async function getProfilesByDids(authorDids: readonly string[]) {
  if (authorDids.length === 0) return [];
  const db = await getRequiredClient();
  return db
    .selectFrom('com_marginalia_profile')
    .selectAll()
    .where('authorDid', 'in', authorDids)
    .execute();
}

export async function getFollowedDids(authorDid: string) {
  const db = await getRequiredClient();
  const follows = await db
    .selectFrom('com_marginalia_follow')
    .select('subject')
    .where('authorDid', '=', authorDid)
    .execute();
  return follows.map((follow) => follow.subject);
}

export async function getHighlightsForChapter(
  authorDid: string,
  bookId: string,
  chapter: number,
) {
  const db = await getRequiredClient();
  return db
    .selectFrom('com_marginalia_highlight')
    .selectAll()
    .where('authorDid', '=', authorDid)
    .where('bookId', '=', bookId)
    .where('chapter', '=', chapter)
    .execute();
}

export async function deleteCommentary(uri: string) {
  const db = await getRequiredClient();
  await db
    .deleteFrom('com_marginalia_commentary')
    .where('uri', '=', uri)
    .execute();
}

export async function deleteAnnotation(uri: string) {
  const db = await getRequiredClient();
  await db
    .deleteFrom('com_marginalia_annotation')
    .where('uri', '=', uri)
    .execute();
}

export async function deleteHighlight(uri: string) {
  const db = await getRequiredClient();
  await db
    .deleteFrom('com_marginalia_highlight')
    .where('uri', '=', uri)
    .execute();
}

export async function deleteProfile(uri: string) {
  const db = await getRequiredClient();
  await db
    .deleteFrom('com_marginalia_profile')
    .where('uri', '=', uri)
    .execute();
}

export async function deleteFollow(uri: string) {
  const db = await getRequiredClient();
  await db.deleteFrom('com_marginalia_follow').where('uri', '=', uri).execute();
}
