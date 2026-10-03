import { Box, clsx, ScrollArea } from '@a-type/ui';

import { AnnotationPane } from '#/components/annotations/AnnotationPane';
import { AnnotationToolbar } from '#/components/annotations/AnnotationToolbar';
import type { AnnotationWithVerses } from '#/components/annotations/useChapterAnnotations';
import { VerseGutter } from '#/components/annotations/VerseGutter';
import { BookIdProvider, USFMRenderer } from '#/components/usfm';
import type { BibleLocation } from '#/lib/bible/location';
import type { TranslationManifest } from '#/lib/bible/source';
import cls from './AnnotatedBibleChapter.module.css';
import { BibleChapterNavigation } from './BibleChapterNavigation';
import { BibleReaderLocation } from './BibleReaderLocation';

export interface AnnotatedBibleChapterProps {
  accountDid: string | null;
  annotations: readonly AnnotationWithVerses[];
  location: BibleLocation;
  manifest: TranslationManifest;
  source: string;
  translationId: string;
  className?: string;
}

export function AnnotatedBibleChapter({
  accountDid,
  annotations,
  location,
  manifest,
  source,
  translationId,
  className,
}: AnnotatedBibleChapterProps) {
  return (
    <>
      <Box
        surface="ambient"
        elevated="md"
        full="width"
        border
        className={clsx(cls.root, className)}
      >
        <ScrollArea direction="vertical" className={cls.scrollArea}>
          <div className={cls.chapterContent}>
            <BibleReaderLocation
              bookId={location.bookId}
              chapter={location.chapter}
              manifest={manifest}
              translationId={translationId}
              className={cls.location}
            />
            <Box gap>
              <Box p className="min-w-0">
                <BookIdProvider bookId={location.bookId}>
                  <USFMRenderer usfm={source} chapter={location.chapter} />
                </BookIdProvider>
              </Box>
              <VerseGutter annotations={annotations} />
            </Box>
            <BibleChapterNavigation
              location={location}
              manifest={manifest}
              translationId={translationId}
            />
          </div>
        </ScrollArea>
      </Box>
      <AnnotationToolbar />
      <AnnotationPane accountDid={accountDid} className={cls.annotationPane} />
    </>
  );
}
