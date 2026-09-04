import { Box } from '@a-type/ui';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import { annotationPaneStore } from '#/components/annotations/annotationPaneStore';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { UserMenu } from '#/components/auth/UserMenu';
import { storeBibleLocation } from '#/lib/bible/location';
import { storeTranslationId } from '#/lib/bible/source';
import { userAccountQueryOptions } from '#/queries/user';
import { useSuspenseQuery } from '@tanstack/react-query';
import { AnnotatedBibleChapter } from './AnnotatedBibleChapter';
import cls from './BibleReader.module.css';
import { BibleReaderLocation } from './BibleReaderLocation';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export function BibleReader() {
  const { location, manifest, source, translationId } =
    readerRoute.useLoaderData();
  const { data: account } = useSuspenseQuery(userAccountQueryOptions);
  const annotations = useChapterAnnotations(account?.did ?? null, location);

  useEffect(() => {
    annotationPaneStore.actions.reset();
  }, [location.bookId, location.chapter]);

  useEffect(() => {
    storeBibleLocation(location);
    storeTranslationId(translationId);
  }, [location, translationId]);

  return (
    <main className={cls.root}>
      <Box className={cls.pane}></Box>
      <Box className={cls.menubar}>
        <UserMenu />
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
