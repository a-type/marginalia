import { Box, ScrollArea } from '@a-type/ui';

import { AnnotationPane } from '#/components/annotations/AnnotationPane';
import type { AnnotationWithVerses } from '#/components/annotations/useChapterAnnotations';
import { VerseGutter } from '#/components/annotations/VerseGutter';
import { BookIdProvider, USFMRenderer } from '#/components/usfm';
import type { BibleLocation } from '#/lib/bible/location';
import cls from './BibleReader.module.css';

export interface AnnotatedBibleChapterProps {
  accountDid: string | null;
  annotations: readonly AnnotationWithVerses[];
  location: BibleLocation;
  source: string;
}

export function AnnotatedBibleChapter({
  accountDid,
  annotations,
  location,
  source,
}: AnnotatedBibleChapterProps) {
  return (
    <>
      <Box surface="ambient" elevated="md" border className={cls.content}>
        <ScrollArea direction="vertical">
          <Box gap>
            <Box p className="min-w-0">
              <BookIdProvider bookId={location.bookId}>
                <USFMRenderer usfm={source} chapter={location.chapter} />
              </BookIdProvider>
            </Box>
            <VerseGutter annotations={annotations} />
          </Box>
        </ScrollArea>
      </Box>
      <AnnotationPane accountDid={accountDid} className={cls.annotationPane} />
    </>
  );
}
