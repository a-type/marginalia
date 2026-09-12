import { Box, ColorModeToggle } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useResetAnnotationPaneOnRouteChange } from '#/components/annotations/annotationPaneStore';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { useHighlightSync } from '#/components/annotations/useChapterHighlights';
import { SocialSidebar } from '#/components/auth/SocialSidebar';
import { UserMenu } from '#/components/auth/UserMenu';
import { reconcileChapterAnnotations } from '#/lib/annotations/reconcile';
import { storeBibleLocation } from '#/lib/bible/location';
import { storeTranslationId } from '#/lib/bible/source';
import { reconcileChapterHighlights } from '#/lib/highlights/reconcile';
import { userAccountQueryOptions } from '#/queries/user';
import { useSuspenseQuery } from '@tanstack/react-query';
import { AnnotatedBibleChapter } from './AnnotatedBibleChapter';
import cls from './BibleReader.module.css';
import { BibleReaderLocation } from './BibleReaderLocation';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export function BibleReader() {
  const {
    chapterAnnotations,
    chapterHighlights,
    location,
    manifest,
    source,
    translationId,
  } = readerRoute.useLoaderData();
  const dbClient = useDbClient();
  const { data: account } = useSuspenseQuery(userAccountQueryOptions);
  const annotations = useChapterAnnotations(account?.did ?? null, location);
  useHighlightSync(account?.did ?? null);
  useResetAnnotationPaneOnRouteChange();

  useEffect(() => {
    storeBibleLocation(location);
    storeTranslationId(translationId);
  }, [location, translationId]);

  useEffect(() => {
    void reconcileChapterAnnotations(dbClient, location, chapterAnnotations);
  }, [chapterAnnotations, dbClient, location]);

  useEffect(() => {
    void reconcileChapterHighlights(dbClient, location, chapterHighlights);
  }, [chapterHighlights, dbClient, location]);

  return (
    <main className={cls.root}>
      <Box className={cls.pane} items="center">
        <SocialSidebar accountDid={account?.did ?? null} />
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
        accountDid={account?.did ?? null}
        annotations={annotations}
        location={location}
        source={source}
      />
    </main>
  );
}
