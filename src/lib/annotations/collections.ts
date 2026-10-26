import type { DbClient } from '@tanstack/react-db';
import { BasicIndex } from '@tanstack/react-db';

import type { BookId, VerseId } from '#/lib/bible/verse';
import { parseVerseId } from '#/lib/bible/verse';
import { indexedDbCollectionOptions } from './indexeddb';

export type AnnotationStatus = 'pending' | 'uploaded' | 'synced';

export interface AnnotationRecord {
  id: string;
  rkey: string;
  uri: string | null;
  cid: string | null;
  authorDid: string | null;
  bookId: BookId;
  chapter: number;
  chapterKeys: string[];
  verses: VerseId[];
  comment: string;
  createdAt: string;
  status: AnnotationStatus;
  syncError: string | null;
}

export interface ChapterAnnotationSnapshot {
  annotations: AnnotationRecord[];
}

export interface AnnotationSyncPage extends ChapterAnnotationSnapshot {
  cursor?: string;
}

export const annotationCollectionOptions =
  indexedDbCollectionOptions<AnnotationRecord>({
    id: 'annotations-v3',
    storeName: 'annotations',
    defaultIndexType: BasicIndex,
    autoIndex: 'eager',
    syncMode: 'on-demand',
  });

export function getAnnotationCollections(dbClient: DbClient) {
  return { annotations: dbClient.collection(annotationCollectionOptions) };
}

export function formatAnnotationChapterKey(bookId: BookId, chapter: number) {
  return `${bookId}/${chapter}`;
}

export function getAnnotationChapterKeys(verses: readonly VerseId[]) {
  return [
    ...new Set(
      verses.map((verseId) => {
        const verse = parseVerseId(verseId);
        return formatAnnotationChapterKey(verse.bookId, verse.chapter);
      }),
    ),
  ];
}

export async function ensureAnnotationCollectionReady(
  annotations: ReturnType<typeof getAnnotationCollections>['annotations'],
) {
  if (annotations.isReady()) return;
  await new Promise<void>((resolve, reject) => {
    let unsubscribeReady = () => {};
    let unsubscribeError = () => {};
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      unsubscribeReady();
      unsubscribeError();
      if (error) reject(error);
      else resolve();
    };
    unsubscribeReady = annotations.on('status:ready', () => finish());
    unsubscribeError = annotations.on('status:error', () =>
      finish(new Error('Annotation collection sync failed')),
    );
    if (annotations.isReady()) {
      finish();
    } else if (annotations.status === 'error') {
      finish(new Error('Annotation collection sync failed'));
    } else {
      try {
        annotations.startSyncImmediate();
      } catch (error) {
        finish(error);
      }
    }
  });
}
