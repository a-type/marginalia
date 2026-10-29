import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AnnotationPane } from '#/components/annotations/AnnotationPane';
import { useResetAnnotationPaneOnRouteChange } from '#/components/annotations/annotationPaneStore';
import {
  VerseSelectionProvider,
  useSelectedVerseIds,
} from '#/components/annotations/VerseSelection';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { useHighlightSync } from '#/components/annotations/useChapterHighlights';
import type { ChapterAnnotationSnapshot } from '#/lib/annotations/collections';
import { reconcileChapterAnnotations } from '#/lib/annotations/reconcile';
import type { BibleLocation } from '#/lib/bible/location';
import { storeReadingTabLocation } from '#/lib/bible/reading-tabs';
import { rememberTranslation, storeTranslationId } from '#/lib/bible/source';
import type { ChapterHighlightSnapshot } from '#/lib/highlights/collections';
import { reconcileChapterHighlights } from '#/lib/highlights/reconcile';
import { chapterAnnotationsQueryOptions } from '#/queries/annotations';
import { chapterHighlightsQueryOptions } from '#/queries/highlights';
import { currentUserDidQueryOptions } from '#/queries/user';
import { AnnotatedBibleChapter } from './AnnotatedBibleChapter';
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
  const { location, manifest, source, translationId } =
    readerRoute.useLoaderData();
  const selectedVerse = useSelectedVerseIds().at(0);
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
  const { accountDid, annotations } = useBibleReaderData(location);

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
        <AnnotatedBibleChapter
          key={`${translationId}/${location.bookId}/${location.chapter}`}
          className={cls.chapter}
          header={
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
          }
          annotations={annotations}
          location={location}
          manifest={manifest}
          source={source}
          translationId={translationId}
        />
      </section>
      <AnnotationPane accountDid={accountDid} className={cls.annotationPane} />
    </div>
  );
}

function useBibleReaderData(location: BibleLocation) {
  const dbClient = useDbClient();
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  const chapterAnnotationsQuery = useQuery({
    ...chapterAnnotationsQueryOptions(location),
    enabled: typeof window !== 'undefined' && userDidQuery.isSuccess,
  });
  const chapterHighlightsQuery = useQuery({
    ...chapterHighlightsQueryOptions(location),
    enabled: typeof window !== 'undefined' && userDidQuery.isSuccess,
  });
  const annotations = useChapterAnnotations(location);
  useHighlightSync(accountDid);
  useReconcileChapterAnnotations({
    accountDid,
    dbClient,
    location,
    queryData: chapterAnnotationsQuery.data,
    queryIsSuccess: chapterAnnotationsQuery.isSuccess,
    userQueryIsSuccess: userDidQuery.isSuccess,
  });
  useReconcileChapterHighlights({
    accountDid,
    dbClient,
    location,
    queryData: chapterHighlightsQuery.data,
    queryIsSuccess: chapterHighlightsQuery.isSuccess,
    userQueryIsSuccess: userDidQuery.isSuccess,
  });
  return { accountDid, annotations };
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
  useEffect(() => {
    if (!userQueryIsSuccess) return;
    if (!accountDid || !queryIsSuccess) return;
    void reconcileChapterAnnotations(
      dbClient,
      location,
      queryData ?? emptyChapterAnnotations,
    );
  }, [
    accountDid,
    userQueryIsSuccess,
    queryData,
    queryIsSuccess,
    dbClient,
    location,
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
  useEffect(() => {
    if (!userQueryIsSuccess) return;
    if (accountDid && !queryIsSuccess) return;
    void reconcileChapterHighlights(
      dbClient,
      location,
      queryData ?? emptyChapterHighlights,
    );
  }, [
    accountDid,
    userQueryIsSuccess,
    queryData,
    queryIsSuccess,
    dbClient,
    location,
  ]);
}
