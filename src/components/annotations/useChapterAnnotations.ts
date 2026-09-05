import { and, eq, useDbClient, useLiveQuery } from '@tanstack/react-db';
import { useEffect } from 'react';

import {
  annotationCollectionOptions,
  annotationVerseCollectionOptions,
} from '#/lib/annotations/collections';
import type { AnnotationRecord } from '#/lib/annotations/collections';
import { requestAnnotationSync } from '#/lib/annotations/sync';
import type { BibleLocation } from '#/lib/bible/location';
import type { VerseId } from '#/lib/bible/verse';

export interface AnnotationWithVerses extends AnnotationRecord {
  verses: VerseId[];
}

export function useChapterAnnotations(
  accountDid: string | null,
  location: BibleLocation,
) {
  const dbClient = useDbClient();
  const { data } = useLiveQuery({
    query: (query) =>
      query
        .from({ annotationVerse: annotationVerseCollectionOptions })
        .innerJoin(
          { annotation: annotationCollectionOptions },
          ({ annotation, annotationVerse }) =>
            eq(annotation.id, annotationVerse.annotationId),
        )
        .where(({ annotationVerse }) =>
          and(
            eq(annotationVerse.bookId, location.bookId),
            eq(annotationVerse.chapter, location.chapter),
          ),
        )
        .orderBy(({ annotation }) => annotation.createdAt, 'desc')
        .orderBy(({ annotationVerse }) => annotationVerse.ordinal)
        .select(({ annotation, annotationVerse }) => ({
          ...annotation,
          verseId: annotationVerse.verseId,
        })),
  });

  useEffect(() => {
    if (!accountDid) return;
    const synchronize = () => {
      void requestAnnotationSync(dbClient, accountDid);
    };
    synchronize();
    window.addEventListener('online', synchronize);
    return () => window.removeEventListener('online', synchronize);
  }, [accountDid, dbClient]);

  const annotations = new Map<string, AnnotationWithVerses>();
  for (const row of data) {
    const annotation = annotations.get(row.id);
    if (annotation) {
      annotation.verses.push(row.verseId);
    } else {
      const { verseId, ...record } = row;
      annotations.set(row.id, { ...record, verses: [verseId] });
    }
  }
  return [...annotations.values()];
}
