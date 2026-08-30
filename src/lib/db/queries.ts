import { sql } from 'kysely'

import { getRequiredClient } from '#/db'

interface RecordMetadata {
  uri: string
  tid: string
  cid: string | null
  authorDid: string
  recordJson: string
}

export interface UpsertCommentaryInput extends RecordMetadata {
  name: string
}

export interface AnnotationVerseInput {
  verseId: string
  bookId: string
  chapter: number
  verse: number
}

export interface UpsertAnnotationInput extends RecordMetadata {
  commentaryId: string | null
  verses: readonly AnnotationVerseInput[]
  comment: string | null
  color: string | null
  createdAt: string
}

export async function upsertCommentary(input: UpsertCommentaryInput) {
  const db = await getRequiredClient()

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
    .execute()
}

export async function upsertAnnotation(input: UpsertAnnotationInput) {
  const db = await getRequiredClient()
  const { verses, ...annotation } = input

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
          color: sql`excluded.color`,
          recordJson: sql`excluded.recordJson`,
          createdAt: sql`excluded.createdAt`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        }),
      )
      .execute()

    await transaction
      .deleteFrom('com_marginalia_annotation_verse')
      .where('annotationUri', '=', annotation.uri)
      .execute()

    const uniqueVerses = [
      ...new Map(verses.map((verse) => [verse.verseId, verse])).values(),
    ]
    if (uniqueVerses.length > 0) {
      await transaction
        .insertInto('com_marginalia_annotation_verse')
        .values(
          uniqueVerses.map((verse) => ({
            annotationUri: annotation.uri,
            ...verse,
          })),
        )
        .execute()
    }
  })
}

export async function getAnnotationsForVerse(verseId: string) {
  const db = await getRequiredClient()
  return db
    .selectFrom('com_marginalia_annotation as annotation')
    .innerJoin(
      'com_marginalia_annotation_verse as verse',
      'verse.annotationUri',
      'annotation.uri',
    )
    .selectAll('annotation')
    .where('verse.verseId', '=', verseId)
    .orderBy('annotation.createdAt', 'desc')
    .execute()
}

export async function deleteCommentary(uri: string) {
  const db = await getRequiredClient()
  await db
    .deleteFrom('com_marginalia_commentary')
    .where('uri', '=', uri)
    .execute()
}

export async function deleteAnnotation(uri: string) {
  const db = await getRequiredClient()
  await db
    .deleteFrom('com_marginalia_annotation')
    .where('uri', '=', uri)
    .execute()
}
