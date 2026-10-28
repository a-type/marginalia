import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AnnotationPane } from '#/components/annotations/AnnotationPane';
import { useResetAnnotationPaneOnRouteChange } from '#/components/annotations/annotationPaneStore';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { useHighlightSync } from '#/components/annotations/useChapterHighlights';
import type { ChapterAnnotationSnapshot } from '#/lib/annotations/collections';
import { reconcileChapterAnnotations } from '#/lib/annotations/reconcile';
import type { BibleLocation } from '#/lib/bible/location';
import { storeBibleLocation } from '#/lib/bible/location';
import { parseVerseSelection } from '#/lib/bible/selection';
import { rememberTranslation, storeTranslationId } from '#/lib/bible/source';
import { formatVerseId } from '#/lib/bible/verse';
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
  const { location, manifest, source, translationId } =
    readerRoute.useLoaderData();
  const selectedVerses = readerRoute.useSearch({
    select: (search) => search.verses,
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const { accountDid, annotations } = useBibleReaderData(location);

  useResetAnnotationPaneOnRouteChange();
  useScrollToSelectedVerse(location, selectedVerses, translationId);
  useStoreBibleReaderLocation(location, translationId, manifest.title);

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
  location: BibleLocation,
  selection: string | undefined,
  translationId: string,
) {
  useEffect(() => {
    const verse = parseVerseSelection(selection).at(0);
    if (!verse) return;
    const verseId = formatVerseId(location.bookId, location.chapter, verse);
    const element = document.getElementById(`verse-${verseId}`);
    if (!element) return;
    element.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [location.bookId, location.chapter, selection, translationId]);
}

function useStoreBibleReaderLocation(
  location: BibleLocation,
  translationId: string,
  translationTitle: string,
) {
  useEffect(() => {
    storeBibleLocation(location);
    storeTranslationId(translationId);
    rememberTranslation({ id: translationId, title: translationTitle });
  }, [location, translationId, translationTitle]);
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
