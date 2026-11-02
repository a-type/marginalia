import { Box } from '@a-type/ui';

import type { BibleLocation } from '../../lib/bible/location';
import type { AnnotationWithVerses } from '../annotations/useChapterAnnotations';
import { VerseGutter } from '../annotations/VerseGutter';
import { BookIdProvider, USFMRenderer } from '../usfm';
import cls from './AnnotatedBibleChapter.module.css';

export interface AnnotatedBibleChapterProps {
  annotations: readonly AnnotationWithVerses[];
  location: BibleLocation;
  source: string;
}

export function AnnotatedBibleChapter({
  annotations,
  location,
  source,
}: AnnotatedBibleChapterProps) {
  return (
    <Box gap className={cls.verseRow}>
      <Box p className={`${cls.text} min-w-0`}>
        <BookIdProvider bookId={location.bookId}>
          <USFMRenderer usfm={source} chapter={location.chapter} />
        </BookIdProvider>
      </Box>
      <VerseGutter annotations={annotations} />
    </Box>
  );
}
