import { Box, ColorModeToggle } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useResetAnnotationPaneOnRouteChange } from '#/components/annotations/annotationPaneStore';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { useHighlightSync } from '#/components/annotations/useChapterHighlights';
import { SocialSidebar } from '#/components/auth/SocialSidebar';
import { UserMenu } from '#/components/auth/UserMenu';
import type { ChapterAnnotationSnapshot } from '#/lib/annotations/collections';
import { reconcileChapterAnnotations } from '#/lib/annotations/reconcile';
import { storeBibleLocation } from '#/lib/bible/location';
import { storeTranslationId } from '#/lib/bible/source';
import type { ChapterHighlightSnapshot } from '#/lib/highlights/collections';
import { reconcileChapterHighlights } from '#/lib/highlights/reconcile';
import { chapterAnnotationsQueryOptions } from '#/queries/annotations';
import { chapterHighlightsQueryOptions } from '#/queries/highlights';
import { currentUserDidQueryOptions } from '#/queries/user';
import { AnnotatedBibleChapter } from './AnnotatedBibleChapter';
import cls from './BibleReader.module.css';
import { BibleReaderLocation } from './BibleReaderLocation';

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
    ...chapterAnnotationsQueryOptions(accountDid, location),
    enabled:
      typeof window !== 'undefined' &&
      userDidQuery.isSuccess &&
      Boolean(accountDid),
  });
  const chapterHighlightsQuery = useQuery({
    ...chapterHighlightsQueryOptions(accountDid, location),
    enabled:
      typeof window !== 'undefined' &&
      userDidQuery.isSuccess &&
      Boolean(accountDid),
  });
  const annotations = useChapterAnnotations(accountDid, location);
  useHighlightSync(accountDid);
  useResetAnnotationPaneOnRouteChange();

  useEffect(() => {
    storeBibleLocation(location);
    storeTranslationId(translationId);
  }, [location, translationId]);

  useEffect(() => {
    if (!userDidQuery.isSuccess) return;
    if (accountDid && !chapterAnnotationsQuery.isSuccess) return;
    void reconcileChapterAnnotations(
      dbClient,
      location,
      chapterAnnotationsQuery.data ?? emptyChapterAnnotations,
    );
  }, [
    accountDid,
    userDidQuery.isSuccess,
    chapterAnnotationsQuery.data,
    chapterAnnotationsQuery.isSuccess,
    dbClient,
    location,
  ]);

  useEffect(() => {
    if (!userDidQuery.isSuccess) return;
    if (accountDid && !chapterHighlightsQuery.isSuccess) return;
    void reconcileChapterHighlights(
      dbClient,
      location,
      chapterHighlightsQuery.data ?? emptyChapterHighlights,
    );
  }, [
    accountDid,
    userDidQuery.isSuccess,
    chapterHighlightsQuery.data,
    chapterHighlightsQuery.isSuccess,
    dbClient,
    location,
  ]);

  return (
    <main className={cls.root}>
      <Box className={cls.pane} items="center">
        <SocialSidebar accountDid={accountDid} />
      </Box>
      <Box className={cls.menubar} items="center">
        <UserMenu />
        <ColorModeToggle />
      </Box>
      <BibleReaderLocation
        bookId={location.bookId}
        chapter={location.chapter}
        manifest={manifest}
        translationId={translationId}
        className={cls.location}
      />
      <AnnotatedBibleChapter
        key={`${location.bookId}/${location.chapter}`}
        accountDid={accountDid}
        annotations={annotations}
        location={location}
        source={source}
      />
    </main>
  );
}
