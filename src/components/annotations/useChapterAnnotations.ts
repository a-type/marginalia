import { inArray, useLiveQuery } from '@tanstack/react-db';

import type { AnnotationRecord } from '#/lib/annotations/collections';
import {
  annotationCollectionOptions,
  formatAnnotationChapterKey,
} from '#/lib/annotations/collections';
import type { BibleLocation } from '#/lib/bible/location';
import type { VerseId } from '#/lib/bible/verse';
import { parseVerseId } from '#/lib/bible/verse';

export interface AnnotationWithVerses extends AnnotationRecord {
  verses: VerseId[];
}

export function useChapterAnnotations(location: BibleLocation) {
  const { data } = useLiveQuery({
    query: (query) =>
      query
        .from({ annotation: annotationCollectionOptions })
        .where(({ annotation }) =>
          inArray(
            formatAnnotationChapterKey(location.bookId, location.chapter),
            annotation.chapterKeys,
          ),
        )
        .orderBy(({ annotation }) => annotation.createdAt, 'desc')
        .select(({ annotation }) => ({ ...annotation })),
  });

  return data.flatMap((annotation) => {
    const verses = annotation.verses.filter((verseId) => {
      const verse = parseVerseId(verseId);
      return (
        verse.bookId === location.bookId && verse.chapter === location.chapter
      );
    });
    return verses.length > 0 ? [{ ...annotation, verses }] : [];
  });
}
