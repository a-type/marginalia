import { Box, Button, ScrollArea } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useLocation, useRouter } from '@tanstack/react-router';
import type { RefObject } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { logger } from '#/logger';
import { m } from '#/paraglide/messages';
import type { ChapterAnnotationSnapshot } from '../../lib/annotations/collections';
import { reconcileChapterAnnotations } from '../../lib/annotations/reconcile';
import type { BibleLocation } from '../../lib/bible/location';
import {
  getMaskedReadingPosition,
  getReadingMask,
} from '../../lib/bible/reading-mask';
import {
  readReadingTabsState,
  storeReadingTabLocation,
  storeReadingTabScrollPosition,
} from '../../lib/bible/reading-tabs';
import type { TranslationManifest } from '../../lib/bible/source';
import {
  rememberTranslation,
  storeTranslationId,
} from '../../lib/bible/source';
import type { VerseId } from '../../lib/bible/verse';
import { parseVerseId } from '../../lib/bible/verse';
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
import cls from './BibleReader.module.css';
import { BibleReaderLocation } from './BibleReaderLocation';
import type { ReadingScrollPosition } from './ContinuousChaptersController';
import { useContinuousChapters } from './useContinuousChapters';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const emptyChapterAnnotations: ChapterAnnotationSnapshot = { annotations: [] };
const emptyChapterHighlights: ChapterHighlightSnapshot = { highlights: [] };

export function BibleReader() {
  const { location, translationId } = readerRoute.useLoaderData();
  const pathname = useLocation({
    select: (routeLocation) => routeLocation.pathname,
  });
  const requestedTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  const search = readerRoute.useSearch();
  const tabs = typeof window === 'undefined' ? [] : readReadingTabsState().tabs;
  const requestedTab = tabs.find((tab) => tab.id === requestedTabId);
  const [lastReadyTabId, setLastReadyTabId] = useState(requestedTabId);
  const tabMatchesRoute =
    requestedTab?.translationId === translationId &&
    requestedTab.bookId === location.bookId &&
    requestedTab.chapter === location.chapter;
  const routeReady =
    pathname === `/${translationId}/${location.bookId}/${location.chapter}` &&
    (!requestedTabId || tabMatchesRoute || requestedTabId === lastReadyTabId);
  const activeReadingTabId = routeReady ? requestedTabId : lastReadyTabId;

  useLayoutEffect(() => {
    if (routeReady) setLastReadyTabId(requestedTabId);
  }, [routeReady, requestedTabId]);

  const activeTab = tabs.find((tab) => tab.id === activeReadingTabId);
  const selection = routeReady ? search.verses : activeTab?.verses;

  return (
    <VerseSelectionProvider selectionOverride={selection ?? null}>
      <BibleReaderContent
        key={`${translationId}/${location.bookId}/${location.chapter}/${activeReadingTabId ?? ''}`}
        activeReadingTabId={activeReadingTabId}
        selection={selection}
      />
    </VerseSelectionProvider>
  );
}

function BibleReaderContent({
  activeReadingTabId,
  selection,
}: {
  activeReadingTabId: string | undefined;
  selection: string | undefined;
}) {
  const { location, manifest, sources, translationId } =
    readerRoute.useLoaderData();
  const selectedVerses = useSelectedVerseIds();
  const selectedVerse = selectedVerses.at(0);
  const search = readerRoute.useSearch();
  const { pathname, maskedPathname, translationScrollPosition } = useLocation({
    select: (routeLocation) => ({
      pathname: routeLocation.pathname,
      maskedPathname: routeLocation.maskedLocation?.pathname,
      translationScrollPosition: routeLocation.state.translationScrollPosition,
    }),
  });
  const readerSearch = { ...search, verses: selection };
  const [annotationTarget, setAnnotationTarget] = useState<VerseId>();
  const scrollThumbRef = useRef<HTMLDivElement>(null);
  const savedTab =
    typeof window === 'undefined'
      ? undefined
      : readReadingTabsState().tabs.find(
          (tab) =>
            tab.id === activeReadingTabId &&
            tab.translationId === translationId &&
            tab.bookId === location.bookId &&
            tab.chapter === location.chapter,
        );
  const tabPosition = savedTab?.position;
  const tabScrollProgress = savedTab?.scrollProgress;
  const restoredTranslationPosition =
    translationScrollPosition?.translationId === translationId &&
    translationScrollPosition.location.bookId === location.bookId &&
    translationScrollPosition.location.chapter === location.chapter &&
    typeof translationScrollPosition.position.bookId === 'string' &&
    Number.isSafeInteger(translationScrollPosition.position.chapter) &&
    translationScrollPosition.position.chapter > 0 &&
    Number.isFinite(translationScrollPosition.scrollProgress)
      ? translationScrollPosition
      : undefined;
  const restoredPosition =
    tabPosition ??
    restoredTranslationPosition?.position ??
    (!savedTab
      ? getMaskedReadingPosition(translationId, maskedPathname)
      : undefined);
  const restoredScrollProgress =
    tabScrollProgress ?? restoredTranslationPosition?.scrollProgress;
  const {
    active,
    initialPositionSettled,
    chapters,
    viewportRef,
    contentRef,
    beforeRef,
    afterRef,
    onScroll,
    scrubLocation,
    startScrubbing,
    finishScrubbing,
    getSource,
    getScrollPosition,
    goTo,
  } = useContinuousChapters({
    location,
    manifest,
    sources,
    translationId,
    readingPosition: restoredPosition,
    scrollProgress: restoredScrollProgress,
  });
  const readingScrollPositionRef = useRef(getScrollPosition);
  readingScrollPositionRef.current = getScrollPosition;
  const annotationLocation = annotationTarget
    ? parseVerseId(annotationTarget)
    : undefined;
  const annotationChapterInWindow =
    annotationLocation !== undefined &&
    chapters.some(
      (chapter) =>
        chapter.bookId === annotationLocation.bookId &&
        chapter.chapter === annotationLocation.chapter,
    );
  const annotationChapterLoaded =
    annotationLocation !== undefined &&
    annotationChapterInWindow &&
    getSource(annotationLocation.bookId).data !== undefined;
  useLayoutEffect(() => {
    if (!annotationTarget || !annotationLocation) return;
    if (!annotationChapterInWindow) {
      goTo(annotationLocation);
      return;
    }
    if (!annotationChapterLoaded) return;
    const frame = requestAnimationFrame(() => {
      const verse = document.getElementById(`verse-${annotationTarget}`);
      if (verse && contentRef.current?.contains(verse)) {
        verse.scrollIntoView({ block: 'center' });
      } else {
        logger.warn('Annotation verse is unavailable in the reader', {
          verseId: annotationTarget,
        });
      }
      setAnnotationTarget(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    annotationTarget,
    annotationLocation?.bookId,
    annotationLocation?.chapter,
    annotationChapterInWindow,
    annotationChapterLoaded,
    goTo,
    contentRef,
  ]);
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  useHighlightSync(accountDid);

  useResetAnnotationPaneOnRouteChange();
  const selectedLocation = selectedVerse
    ? parseVerseId(selectedVerse)
    : undefined;
  const primaryChapterOutsideWindow =
    selectedLocation !== undefined &&
    !chapters.some(
      (chapter) =>
        chapter.bookId === selectedLocation.bookId &&
        chapter.chapter === selectedLocation.chapter,
    );
  const primaryChapterAnnotationsQuery = useQuery({
    ...chapterAnnotationsQueryOptions(selectedLocation ?? location),
    enabled:
      typeof window !== 'undefined' &&
      userDidQuery.isSuccess &&
      primaryChapterOutsideWindow,
  });
  useReconcileChapterAnnotations({
    accountDid,
    dbClient: useDbClient(),
    location: selectedLocation ?? location,
    queryData: primaryChapterAnnotationsQuery.data,
    queryIsSuccess: primaryChapterAnnotationsQuery.isSuccess,
    userQueryIsSuccess: userDidQuery.isSuccess && primaryChapterOutsideWindow,
  });
  const scrollToSelection =
    selectedLocation?.bookId === location.bookId &&
    selectedLocation.chapter === location.chapter &&
    !restoredPosition &&
    restoredScrollProgress === undefined;
  const initialVerseTarget = useScrollToSelectedVerse(
    scrollToSelection ? selectedVerse : undefined,
  );
  useStoreBibleReaderLocation(
    pathname,
    activeReadingTabId,
    location,
    translationId,
    manifest.title,
    selection,
  );
  useStoreReadingTabScrollPosition(
    activeReadingTabId,
    location,
    translationId,
    viewportRef,
    readingScrollPositionRef,
    initialPositionSettled,
  );
  useSyncReadingMask(
    pathname,
    activeReadingTabId,
    translationId,
    location,
    active,
    readerSearch,
    initialPositionSettled,
  );
  useRestoreReadingPositionOnHistoryNavigation(
    pathname,
    activeReadingTabId,
    translationId,
    location,
    manifest,
    goTo,
  );
  return (
    <div className={cls.root}>
      <section className={cls.content}>
        <div className={cls.readerHeader} data-reader-controls>
          <BibleReaderLocation
            bookId={active.bookId}
            chapter={active.chapter}
            manifest={manifest}
            translationId={translationId}
            onCurrentRouteChapterChange={(bookId, chapter) =>
              goTo({ bookId, chapter })
            }
            className="@mode-dense"
          />
        </div>
        <ScrollArea.Root
          className={cls.scrollArea}
          data-reader-scroll-area
          onScrollCapture={(event) => {
            if (event.target === viewportRef.current) onScroll();
          }}
        >
          <ScrollArea.Viewport direction="vertical" ref={viewportRef}>
            <div className={cls.chapterContent} ref={contentRef}>
              <div className={cls.chapterBuffer} ref={beforeRef} aria-hidden />
              {chapters.map((chapter, index) => {
                const chapterSource = getSource(chapter.bookId);
                return (
                  <section
                    key={`${chapter.bookId}/${chapter.chapter}`}
                    data-reader-chapter={`${chapter.bookId}/${chapter.chapter}`}
                    data-reader-book-start={
                      chapter.chapter === 1 ? '' : undefined
                    }
                    data-reader-chapter-loaded={
                      chapterSource.data !== undefined
                    }
                    ref={
                      chapterSource.data !== undefined &&
                      initialVerseTarget?.chapterKey ===
                        `${chapter.bookId}/${chapter.chapter}`
                        ? initialVerseTarget.ref
                        : undefined
                    }
                  >
                    {index > 0 && <Box className={cls.chapterDivider} />}
                    {chapterSource.isError &&
                    chapterSource.data === undefined ? (
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
              <div className={cls.toolbar}>
                <AnnotationToolbar />
              </div>
              <div className={cls.chapterBuffer} ref={afterRef} aria-hidden />
            </div>
            <ScrollArea.ViewportFades />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            className={cls.scrollbar}
            data-reader-scrubbing={scrubLocation ? '' : undefined}
            onPointerDownCapture={(event) => {
              if (event.button === 0 && event.isPrimary)
                startScrubbing(event.pointerId);
            }}
            onPointerUpCapture={(event) => finishScrubbing(event.pointerId)}
            onPointerCancelCapture={(event) => finishScrubbing(event.pointerId)}
            onLostPointerCapture={(event) => finishScrubbing(event.pointerId)}
          >
            <ScrollArea.Thumb
              className={cls.scrollThumb}
              ref={scrollThumbRef}
            />
          </ScrollArea.Scrollbar>
          {scrubLocation && (
            <ScrubLocationCallout
              location={scrubLocation}
              manifest={manifest}
              thumbRef={scrollThumbRef}
              viewportRef={viewportRef}
            />
          )}
          <ScrollArea.Corner />
        </ScrollArea.Root>
      </section>
      <AnnotationPane
        accountDid={accountDid}
        onOpenVerse={setAnnotationTarget}
        className={cls.annotationPane}
      />
    </div>
  );
}

function ScrubLocationCallout({
  location,
  manifest,
  thumbRef,
  viewportRef,
}: {
  location: BibleLocation;
  manifest: TranslationManifest;
  thumbRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const calloutRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (
      CSS.supports('position-anchor: --reader-scroll-thumb') &&
      CSS.supports('top: anchor(center)')
    )
      return;
    const thumb = thumbRef.current;
    const callout = calloutRef.current;
    const root = thumb?.closest<HTMLElement>('[data-reader-scroll-area]');
    const viewport = viewportRef.current;
    if (!thumb || !callout || !root || !viewport) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const bounds = root.getBoundingClientRect();
      const anchor = thumb.getBoundingClientRect();
      const halfHeight = callout.getBoundingClientRect().height / 2;
      callout.style.top = `${Math.max(
        halfHeight,
        Math.min(
          bounds.height - halfHeight,
          anchor.top + anchor.height / 2 - bounds.top,
        ),
      )}px`;
      callout.style.insetInlineEnd = `${
        getComputedStyle(root).direction === 'rtl'
          ? anchor.right - bounds.left
          : bounds.right - anchor.left
      }px`;
      callout.style.visibility = 'visible';
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    update();
    viewport.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(thumb);
    return () => {
      viewport.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [thumbRef, viewportRef]);
  return (
    <div
      className={cls.scrubLocation}
      ref={calloutRef}
      data-reader-scrub-location
      aria-hidden
    >
      {manifest.books.find((book) => book.id === location.bookId)?.title}{' '}
      {location.chapter}
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

function useScrollToSelectedVerse(verseId: VerseId | undefined) {
  const [target] = useState(() => {
    if (!verseId) return undefined;
    const { bookId, chapter } = parseVerseId(verseId);
    let scrolled = false;
    return {
      chapterKey: `${bookId}/${chapter}`,
      ref(element: HTMLElement | null) {
        if (!element || scrolled) return;
        const frame = requestAnimationFrame(() => {
          const verse = document.getElementById(`verse-${verseId}`);
          if (!verse || !element.contains(verse)) return;
          scrolled = true;
          verse.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
              .matches
              ? 'auto'
              : 'smooth',
          });
        });
        return () => cancelAnimationFrame(frame);
      },
    };
  });
  return target;
}

function useStoreReadingTabScrollPosition(
  activeReadingTabId: string | undefined,
  location: BibleLocation,
  translationId: string,
  viewportRef: RefObject<HTMLDivElement | null>,
  scrollPositionRef: { current: () => ReadingScrollPosition | undefined },
  initialPositionSettled: boolean,
) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!initialPositionSettled || !activeReadingTabId || !viewport) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let pending: ReadingScrollPosition | undefined;
    const save = () => {
      if (!pending) return;
      const { position, scrollProgress } = pending;
      pending = undefined;
      storeReadingTabScrollPosition(
        activeReadingTabId,
        location,
        translationId,
        position,
        scrollProgress,
      );
    };
    const onScroll = () => {
      const current = scrollPositionRef.current();
      if (!current) return;
      pending = current;
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = setTimeout(save, 120);
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
      if (timeout !== undefined) clearTimeout(timeout);
      save();
    };
  }, [
    activeReadingTabId,
    location,
    translationId,
    viewportRef,
    scrollPositionRef,
    initialPositionSettled,
  ]);
}

function useSyncReadingMask(
  pathname: string,
  activeReadingTabId: string | undefined,
  translationId: string,
  location: BibleLocation,
  active: BibleLocation,
  search: ReturnType<typeof readerRoute.useSearch>,
  initialPositionSettled: boolean,
) {
  const router = useRouter();
  useEffect(() => {
    if (!initialPositionSettled) return;
    const currentLocation = router.parseLocation(router.history.location);
    if (
      pathname !== `/${translationId}/${location.bookId}/${location.chapter}` ||
      currentLocation.pathname !== pathname ||
      currentLocation.state.activeReadingTabId !== activeReadingTabId ||
      (currentLocation.search.verses || undefined) !==
        (search.verses || undefined) ||
      (currentLocation.search.annotation || undefined) !==
        (search.annotation || undefined)
    )
      return;
    const mask = getReadingMask(translationId, location, active, search);
    const currentMask = router.state.location.maskedLocation;
    const savedPosition = router.state.location.state.readingPosition;
    if (
      savedPosition?.bookId === active.bookId &&
      savedPosition.chapter === active.chapter &&
      (mask
        ? currentMask?.pathname ===
            `/${translationId}/${active.bookId}/${active.chapter}` &&
          (currentMask.search.verses || undefined) === mask.search.verses &&
          (currentMask.search.annotation || undefined) ===
            mask.search.annotation
        : !currentMask)
    )
      return;
    if (!mask && !currentMask && !savedPosition) return;
    void router.navigate({
      to: '/$translation/$book/$chapter',
      params: {
        translation: translationId,
        book: location.bookId,
        chapter: String(location.chapter),
      },
      search,
      state: (previous) => ({
        ...previous,
        // Router compares the unmasked location when deciding whether to commit.
        readingPosition: active,
      }),
      mask,
      replace: true,
      resetScroll: false,
    });
  }, [
    router,
    pathname,
    activeReadingTabId,
    translationId,
    location,
    active,
    search,
    initialPositionSettled,
  ]);
}

function useRestoreReadingPositionOnHistoryNavigation(
  pathname: string,
  activeReadingTabId: string | undefined,
  translationId: string,
  location: BibleLocation,
  manifest: TranslationManifest,
  goTo: (location: BibleLocation) => void,
) {
  const router = useRouter();
  useEffect(
    () =>
      router.history.subscribe(({ location: historyLocation, action }) => {
        if (
          action.type !== 'BACK' &&
          action.type !== 'FORWARD' &&
          action.type !== 'GO'
        )
          return;
        const parsedLocation = router.parseLocation(historyLocation);
        const readerPathname = `/${translationId}/${location.bookId}/${location.chapter}`;
        if (
          pathname !== readerPathname ||
          (historyLocation.pathname !== readerPathname &&
            parsedLocation.pathname !== readerPathname) ||
          parsedLocation.state.activeReadingTabId !== activeReadingTabId
        )
          return;
        const position =
          getMaskedReadingPosition(translationId, historyLocation.pathname) ??
          getMaskedReadingPosition(translationId, parsedLocation.pathname);
        if (!position) return;
        const book = manifest.books.find(
          (entry) => entry.id === position.bookId,
        );
        if (book && position.chapter >= 1 && position.chapter <= book.chapters)
          goTo(position);
      }),
    [
      router,
      pathname,
      activeReadingTabId,
      translationId,
      location,
      manifest,
      goTo,
    ],
  );
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
