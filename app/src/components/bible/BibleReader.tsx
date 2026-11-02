import { Box, ScrollArea } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useLocation } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import type { ChapterAnnotationSnapshot } from '../../lib/annotations/collections';
import { reconcileChapterAnnotations } from '../../lib/annotations/reconcile';
import type { BibleLocation } from '../../lib/bible/location';
import { storeReadingTabLocation } from '../../lib/bible/reading-tabs';
import {
  rememberTranslation,
  storeTranslationId,
} from '../../lib/bible/source';
import { parseVerseId } from '../../lib/bible/verse';
import { AppError } from '../../lib/error';
import type { ChapterHighlightSnapshot } from '../../lib/highlights/collections';
import { reconcileChapterHighlights } from '../../lib/highlights/reconcile';
import { chapterAnnotationsQueryOptions } from '../../queries/annotations';
import { chapterHighlightsQueryOptions } from '../../queries/highlights';
import { currentUserDidQueryOptions } from '../../queries/user';
import { AnnotationPane } from '../annotations/AnnotationPane';
import { useResetAnnotationPaneOnRouteChange } from '../annotations/annotationPaneStore';
import { AnnotationToolbar } from '../annotations/AnnotationToolbar';
import { useChapterAnnotations } from '../annotations/useChapterAnnotations';
import { useHighlightSync } from '../annotations/useChapterHighlights';
import {
  VerseSelectionProvider,
  useSelectedVerseIds,
} from '../annotations/VerseSelection';
import { AnnotatedBibleChapter } from './AnnotatedBibleChapter';
import { BibleChapterNavigation } from './BibleChapterNavigation';
import cls from './BibleReader.module.css';
import { BibleReaderLocation } from './BibleReaderLocation';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const emptyChapterAnnotations: ChapterAnnotationSnapshot = { annotations: [] };
const emptyChapterHighlights: ChapterHighlightSnapshot = { highlights: [] };

export function BibleReader() {
  return (
    <VerseSelectionProvider>
      <BibleReaderContent />
    </VerseSelectionProvider>
  );
}

function BibleReaderContent() {
  const { location, manifest, sources, translationId } =
    readerRoute.useLoaderData();
  const selectedVerses = useSelectedVerseIds();
  const selectedVerse = selectedVerses.at(0);
  const chapters = selectedVerses.length
    ? selectedVerses.reduce<BibleLocation[]>((result, id) => {
        const { bookId, chapter } = parseVerseId(id);
        if (
          !result.some(
            (entry) => entry.bookId === bookId && entry.chapter === chapter,
          )
        )
          result.push({ bookId, chapter });
        return result;
      }, [])
    : [location];
  const contentRef = useRef<HTMLDivElement>(null);
  const selection = readerRoute.useSearch({
    select: (search) => search.verses,
  });
  const { pathname, activeReadingTabId } = useLocation({
    select: (routeLocation) => ({
      pathname: routeLocation.pathname,
      activeReadingTabId: routeLocation.state.activeReadingTabId,
    }),
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  useHighlightSync(accountDid);

  useResetAnnotationPaneOnRouteChange();
  useScrollToSelectedVerse(selectedVerse, translationId);
  useStoreBibleReaderLocation(
    pathname,
    activeReadingTabId,
    location,
    translationId,
    manifest.title,
    selection,
  );

  return (
    <div className={cls.root}>
      <section className={cls.content}>
        <ScrollArea
          direction="vertical"
          className={cls.scrollArea}
          data-reader-scroll-area
        >
          <div className={cls.chapterContent} ref={contentRef}>
            <div className={cls.readerHeader}>
              <BibleReaderLocation
                bookId={location.bookId}
                chapter={location.chapter}
                manifest={manifest}
                translationId={translationId}
                open={locationOpen}
                onOpenChange={setLocationOpen}
              />
            </div>
            {chapters.map((chapter, index) => {
              const chapterSource = sources.find(
                (entry) => entry.bookId === chapter.bookId,
              );
              if (!chapterSource)
                throw new AppError(
                  AppError.Code.NotFound,
                  `Book ${chapter.bookId} is unavailable`,
                );
              return (
                <section
                  key={`${chapter.bookId}/${chapter.chapter}`}
                  data-reader-chapter={`${chapter.bookId}/${chapter.chapter}`}
                >
                  {index > 0 && <Box className={cls.chapterDivider} />}
                  <ReaderChapter
                    location={chapter}
                    source={chapterSource.source}
                    accountDid={accountDid}
                    userQueryIsSuccess={userDidQuery.isSuccess}
                  />
                </section>
              );
            })}
            <BibleChapterNavigation
              location={location}
              manifest={manifest}
              translationId={translationId}
              getLocation={() =>
                getMostVisibleChapter(contentRef.current, chapters) ?? location
              }
            >
              <AnnotationToolbar />
            </BibleChapterNavigation>
          </div>
        </ScrollArea>
      </section>
      <AnnotationPane accountDid={accountDid} className={cls.annotationPane} />
    </div>
  );
}

function ReaderChapter({
  location,
  source,
  accountDid,
  userQueryIsSuccess,
}: {
  location: BibleLocation;
  source: string;
  accountDid: string | null;
  userQueryIsSuccess: boolean;
}) {
  const dbClient = useDbClient();
  const chapterAnnotationsQuery = useQuery({
    ...chapterAnnotationsQueryOptions(location),
    enabled: typeof window !== 'undefined' && userQueryIsSuccess,
  });
  const chapterHighlightsQuery = useQuery({
    ...chapterHighlightsQueryOptions(location),
    enabled: typeof window !== 'undefined' && userQueryIsSuccess,
  });
  const annotations = useChapterAnnotations(location);
  useReconcileChapterAnnotations({
    accountDid,
    dbClient,
    location,
    queryData: chapterAnnotationsQuery.data,
    queryIsSuccess: chapterAnnotationsQuery.isSuccess,
    userQueryIsSuccess,
  });
  useReconcileChapterHighlights({
    accountDid,
    dbClient,
    location,
    queryData: chapterHighlightsQuery.data,
    queryIsSuccess: chapterHighlightsQuery.isSuccess,
    userQueryIsSuccess,
  });
  return (
    <AnnotatedBibleChapter
      annotations={annotations}
      location={location}
      source={source}
    />
  );
}

function getMostVisibleChapter(
  content: HTMLElement | null,
  chapters: BibleLocation[],
): BibleLocation | undefined {
  const viewport = content?.closest('[data-scroll-direction="vertical"]');
  if (!content || !viewport) return undefined;
  const bounds = viewport.getBoundingClientRect();
  let mostVisible = 0;
  let result: BibleLocation | undefined;
  content
    .querySelectorAll<HTMLElement>('[data-reader-chapter]')
    .forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const visible = Math.max(
        0,
        Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top),
      );
      if (visible > mostVisible) {
        mostVisible = visible;
        result = chapters[index];
      }
    });
  return result;
}

function useScrollToSelectedVerse(
  verseId: string | undefined,
  translationId: string,
) {
  useEffect(() => {
    if (!verseId) return;
    const element = document.getElementById(`verse-${verseId}`);
    if (!element) return;
    element.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [verseId, translationId]);
}

function useStoreBibleReaderLocation(
  pathname: string,
  activeReadingTabId: string | undefined,
  location: BibleLocation,
  translationId: string,
  translationTitle: string,
  selection: string | undefined,
) {
  useEffect(() => {
    if (pathname !== `/${translationId}/${location.bookId}/${location.chapter}`)
      return;

    storeReadingTabLocation(
      activeReadingTabId,
      location,
      translationId,
      selection,
    );
    storeTranslationId(translationId);
    rememberTranslation({ id: translationId, title: translationTitle });
  }, [
    activeReadingTabId,
    location,
    pathname,
    translationId,
    translationTitle,
    selection,
  ]);
}

function useReconcileChapterAnnotations({
  accountDid,
  dbClient,
  location,
  queryData,
  queryIsSuccess,
  userQueryIsSuccess,
}: {
  accountDid: string | null;
  dbClient: ReturnType<typeof useDbClient>;
  location: BibleLocation;
  queryData: ChapterAnnotationSnapshot | undefined;
  queryIsSuccess: boolean;
  userQueryIsSuccess: boolean;
}) {
  const { bookId, chapter } = location;
  useEffect(() => {
    if (!userQueryIsSuccess) return;
    if (!accountDid || !queryIsSuccess) return;
    void reconcileChapterAnnotations(
      dbClient,
      { bookId, chapter },
      queryData ?? emptyChapterAnnotations,
    );
  }, [
    accountDid,
    userQueryIsSuccess,
    queryData,
    queryIsSuccess,
    dbClient,
    bookId,
    chapter,
  ]);
}

function useReconcileChapterHighlights({
  accountDid,
  dbClient,
  location,
  queryData,
  queryIsSuccess,
  userQueryIsSuccess,
}: {
  accountDid: string | null;
  dbClient: ReturnType<typeof useDbClient>;
  location: BibleLocation;
  queryData: ChapterHighlightSnapshot | undefined;
  queryIsSuccess: boolean;
  userQueryIsSuccess: boolean;
}) {
  const { bookId, chapter } = location;
  useEffect(() => {
    if (!userQueryIsSuccess) return;
    if (accountDid && !queryIsSuccess) return;
    void reconcileChapterHighlights(
      dbClient,
      { bookId, chapter },
      queryData ?? emptyChapterHighlights,
    );
  }, [
    accountDid,
    userQueryIsSuccess,
    queryData,
    queryIsSuccess,
    dbClient,
    bookId,
    chapter,
  ]);
}
