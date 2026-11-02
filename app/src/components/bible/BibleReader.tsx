import { Box, Button, ScrollArea } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useLocation, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { m } from '#/paraglide/messages';
import type { ChapterAnnotationSnapshot } from '../../lib/annotations/collections';
import { reconcileChapterAnnotations } from '../../lib/annotations/reconcile';
import type { BibleLocation } from '../../lib/bible/location';
import {
  storeReadingTabLocation,
  storeReadingTabPosition,
  readReadingTabsState,
} from '../../lib/bible/reading-tabs';
import {
  rememberTranslation,
  storeTranslationId,
} from '../../lib/bible/source';
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
import { useContinuousChapters } from './useContinuousChapters';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const emptyChapterAnnotations: ChapterAnnotationSnapshot = { annotations: [] };
const emptyChapterHighlights: ChapterHighlightSnapshot = { highlights: [] };

export function BibleReader() {
  const { location, translationId } = readerRoute.useLoaderData();
  const activeReadingTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  return (
    <VerseSelectionProvider>
      <BibleReaderContent
        key={`${translationId}/${location.bookId}/${location.chapter}/${activeReadingTabId ?? ''}`}
      />
    </VerseSelectionProvider>
  );
}

function BibleReaderContent() {
  const { location, manifest, sources, translationId } =
    readerRoute.useLoaderData();
  const router = useRouter();
  const selectedVerses = useSelectedVerseIds();
  const selectedVerse = selectedVerses.at(0);
  const selection = readerRoute.useSearch({
    select: (search) => search.verses,
  });
  const { pathname, activeReadingTabId, readingPosition } = useLocation({
    select: (routeLocation) => ({
      pathname: routeLocation.pathname,
      activeReadingTabId: routeLocation.state.activeReadingTabId,
      readingPosition: routeLocation.state.readingPosition,
    }),
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const tabPosition =
    typeof window === 'undefined'
      ? undefined
      : readReadingTabsState().tabs.find(
          (tab) =>
            tab.id === activeReadingTabId &&
            tab.translationId === translationId &&
            tab.bookId === location.bookId &&
            tab.chapter === location.chapter,
        )?.position;
  const restoredPosition = readingPosition ?? tabPosition;
  const {
    active,
    chapters,
    contentRef,
    onScroll,
    getSource,
    getVisibleLocation,
    goTo,
  } = useContinuousChapters({
    location,
    manifest,
    sources,
    translationId,
    selectedVerse,
    readingPosition: restoredPosition,
  });
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  useHighlightSync(accountDid);

  useResetAnnotationPaneOnRouteChange();
  useScrollToSelectedVerse(selectedVerse, Boolean(restoredPosition));
  useStoreBibleReaderLocation(
    pathname,
    activeReadingTabId,
    location,
    translationId,
    manifest.title,
    selection,
  );
  useEffect(() => {
    storeReadingTabPosition(
      activeReadingTabId,
      location,
      translationId,
      active,
    );
  }, [activeReadingTabId, location, translationId, active]);
  useEffect(
    () =>
      router.history.subscribe(({ location: historyLocation, action }) => {
        if (
          action.type !== 'BACK' &&
          action.type !== 'FORWARD' &&
          action.type !== 'GO'
        )
          return;
        if (
          historyLocation.pathname !== pathname ||
          historyLocation.state.activeReadingTabId !== activeReadingTabId
        )
          return;
        const position = historyLocation.state.readingPosition ?? location;
        const book = manifest.books.find(
          (entry) => entry.id === position.bookId,
        );
        if (book && position.chapter >= 1 && position.chapter <= book.chapters)
          goTo(position);
      }),
    [router, pathname, activeReadingTabId, location, manifest, goTo],
  );

  return (
    <div className={cls.root}>
      <section className={cls.content}>
        <ScrollArea
          direction="vertical"
          className={cls.scrollArea}
          data-reader-scroll-area
          onScrollCapture={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target ===
                contentRef.current?.closest(
                  '[data-scroll-direction="vertical"]',
                )
            )
              onScroll();
          }}
        >
          <div className={cls.chapterContent} ref={contentRef}>
            <div className={cls.readerHeader}>
              <BibleReaderLocation
                bookId={active.bookId}
                chapter={active.chapter}
                manifest={manifest}
                translationId={translationId}
                open={locationOpen}
                onOpenChange={setLocationOpen}
                onCurrentRouteChapterChange={(bookId, chapter) =>
                  goTo({ bookId, chapter })
                }
              />
            </div>
            {chapters.map((chapter, index) => {
              const chapterSource = getSource(chapter.bookId);
              return (
                <section
                  key={`${chapter.bookId}/${chapter.chapter}`}
                  data-reader-chapter={`${chapter.bookId}/${chapter.chapter}`}
                >
                  {index > 0 && <Box className={cls.chapterDivider} />}
                  {chapterSource.isError ? (
                    <div className={cls.chapterStatus} role="alert">
                      <p>{m.bible_load_error()}</p>
                      <Button onClick={() => void chapterSource.refetch()}>
                        {m.translation_retry()}
                      </Button>
                    </div>
                  ) : chapterSource.data === undefined ? (
                    <p className={cls.chapterStatus} role="status">
                      {m.bible_loading()}
                    </p>
                  ) : (
                    <ReaderChapter
                      location={chapter}
                      source={chapterSource.data}
                      accountDid={accountDid}
                      userQueryIsSuccess={userDidQuery.isSuccess}
                    />
                  )}
                </section>
              );
            })}
            <BibleChapterNavigation
              location={active}
              manifest={manifest}
              translationId={translationId}
              getLocation={getVisibleLocation}
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

function useScrollToSelectedVerse(
  verseId: string | undefined,
  restoredPosition: boolean,
) {
  const [initialVerseId] = useState(() =>
    restoredPosition ? undefined : verseId,
  );
  useEffect(() => {
    if (!initialVerseId) return;
    const element = document.getElementById(`verse-${initialVerseId}`);
    if (!element) return;
    element.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [initialVerseId]);
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
