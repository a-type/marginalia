import type { DbClient } from '@tanstack/react-db';
import {
  BasicIndex,
  collectionOptions,
  localStorageCollectionOptions,
} from '@tanstack/react-db';

import type { BookId, VerseId } from '#/lib/bible/verse';

export type AnnotationStatus = 'pending' | 'uploaded' | 'synced';

export interface AnnotationRecord {
  id: string;
  rkey: string;
  uri: string | null;
  cid: string | null;
  authorDid: string | null;
  bookId: BookId;
  chapter: number;
  comment: string;
  createdAt: string;
  status: AnnotationStatus;
  syncError: string | null;
}

export interface AnnotationVerseRecord {
  id: string;
  annotationId: string;
  verseId: VerseId;
  bookId: BookId;
  chapter: number;
  verse: number;
  ordinal: number;
}

export interface ChapterAnnotationSnapshot {
  annotations: AnnotationRecord[];
  annotationVerses: AnnotationVerseRecord[];
}

export const annotationCollectionOptions = collectionOptions(
  localStorageCollectionOptions<AnnotationRecord>({
    id: 'annotations-v2',
    storageKey: 'marginalia.annotations.v2',
    getKey: (annotation) => annotation.id,
  }),
);

export const annotationVerseCollectionOptions = collectionOptions(
  localStorageCollectionOptions<AnnotationVerseRecord>({
    id: 'annotation-verses-v2',
    storageKey: 'marginalia.annotation-verses.v2',
    getKey: (annotationVerse) => annotationVerse.id,
    defaultIndexType: BasicIndex,
    autoIndex: 'eager',
  }),
);

export function getAnnotationCollections(dbClient: DbClient) {
  return {
    annotations: dbClient.collection(annotationCollectionOptions),
    annotationVerses: dbClient.collection(annotationVerseCollectionOptions),
  };
}

export function formatAnnotationVerseRecordId(
  annotationId: string,
  verseId: VerseId,
) {
  return `${annotationId}#${verseId}`;
}
