import { Box } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useResetAnnotationPaneOnRouteChange } from '#/components/annotations/annotationPaneStore';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { useHighlightSync } from '#/components/annotations/useChapterHighlights';
import { UserMenu } from '#/components/auth/UserMenu';
import type { ChapterAnnotationSnapshot } from '#/lib/annotations/collections';
import { reconcileChapterAnnotations } from '#/lib/annotations/reconcile';
import type { BibleLocation } from '#/lib/bible/location';
import { storeBibleLocation } from '#/lib/bible/location';
import { storeTranslationId } from '#/lib/bible/source';
import type { ChapterHighlightSnapshot } from '#/lib/highlights/collections';
import { reconcileChapterHighlights } from '#/lib/highlights/reconcile';
import { chapterAnnotationsQueryOptions } from '#/queries/annotations';
import { chapterHighlightsQueryOptions } from '#/queries/highlights';
import { currentUserDidQueryOptions } from '#/queries/user';
import { SearchButton } from '../search/SearchButton';
import { AnnotatedBibleChapter } from './AnnotatedBibleChapter';
import cls from './BibleReader.module.css';

const readerRoute = getRouteApi('/$translation/$book/$chapter');
const emptyChapterAnnotations: ChapterAnnotationSnapshot = {
  annotations: [],
  annotationVerses: [],
};
const emptyChapterHighlights: ChapterHighlightSnapshot = { highlights: [] };

export function BibleReader() {
  const { location, manifest, source, translationId } =
    readerRoute.useLoaderData();
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
  const annotations = useChapterAnnotations(accountDid, location);
  useHighlightSync(accountDid);
  useResetAnnotationPaneOnRouteChange();

  useStoreBibleReaderLocation(location, translationId);
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

  return (
    <main className={cls.root}>
      <Box className={cls.pane} items="center"></Box>
      <Box className={cls.menubar} items="center">
        <UserMenu />
        <SearchButton />
      </Box>
      <AnnotatedBibleChapter
        key={`${location.bookId}/${location.chapter}`}
        className={cls.content}
        accountDid={accountDid}
        annotations={annotations}
        location={location}
        manifest={manifest}
        source={source}
        translationId={translationId}
      />
    </main>
  );
}

function useStoreBibleReaderLocation(
  location: BibleLocation,
  translationId: string,
) {
  useEffect(() => {
    storeBibleLocation(location);
    storeTranslationId(translationId);
  }, [location, translationId]);
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
    if (accountDid && !queryIsSuccess) return;
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
