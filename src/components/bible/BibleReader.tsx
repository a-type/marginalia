import { Box, Button, Icon } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AnnotationPane } from '#/components/annotations/AnnotationPane';
import { useResetAnnotationPaneOnRouteChange } from '#/components/annotations/annotationPaneStore';
import { useChapterAnnotations } from '#/components/annotations/useChapterAnnotations';
import { useHighlightSync } from '#/components/annotations/useChapterHighlights';
import { UserMenu } from '#/components/auth/UserMenu';
import type { ChapterAnnotationSnapshot } from '#/lib/annotations/collections';
import { reconcileChapterAnnotations } from '#/lib/annotations/reconcile';
import type { BibleLocation } from '#/lib/bible/location';
import { storeBibleLocation } from '#/lib/bible/location';
import { parseVerseSelection } from '#/lib/bible/selection';
import { storeTranslationId } from '#/lib/bible/source';
import { formatVerseId } from '#/lib/bible/verse';
import type { ChapterHighlightSnapshot } from '#/lib/highlights/collections';
import { reconcileChapterHighlights } from '#/lib/highlights/reconcile';
import { m } from '#/paraglide/messages';
import { chapterAnnotationsQueryOptions } from '#/queries/annotations';
import { chapterHighlightsQueryOptions } from '#/queries/highlights';
import { currentUserDidQueryOptions } from '#/queries/user';
import { BibleSearch } from '../search/BibleSearch';
import { SearchButton } from '../search/SearchButton';
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
  const selectedVerses = readerRoute.useSearch({
    select: (search) => search.verses,
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { accountDid, annotations } = useBibleReaderData(location);

  useResetAnnotationPaneOnRouteChange();
  useScrollToSelectedVerse(location, selectedVerses, translationId);
  useStoreBibleReaderLocation(location, translationId);

  return (
    <main className={cls.root}>
      <Box className={cls.pane} items="center"></Box>
      <Box className={cls.menubar} items="center">
        <UserMenu />
        <SearchButton />
      </Box>
      <section className={cls.content}>
        <div className={cls.readerHeader}>
          <BibleReaderLocation
            bookId={location.bookId}
            chapter={location.chapter}
            manifest={manifest}
            translationId={translationId}
            open={locationOpen}
            onOpenChange={setLocationOpen}
          />
          <Button
            emphasis={searchOpen ? 'light' : 'default'}
            aria-label={
              searchOpen ? m.bible_search_close() : m.bible_search_title()
            }
            aria-pressed={searchOpen}
            title={searchOpen ? m.bible_search_close() : m.bible_search_title()}
            onClick={() => {
              setLocationOpen(false);
              setSearchOpen((open) => !open);
            }}
          >
            <Icon name={searchOpen ? 'x' : 'search'} />
            {searchOpen && <span>{m.bible_search_close()}</span>}
          </Button>
        </div>
        <div className={cls.swapStage}>
          <div
            className={cls.view}
            data-active={!searchOpen}
            aria-hidden={searchOpen}
            inert={searchOpen}
          >
            <AnnotatedBibleChapter
              key={`${translationId}/${location.bookId}/${location.chapter}`}
              className={cls.chapter}
              annotations={annotations}
              location={location}
              manifest={manifest}
              source={source}
              translationId={translationId}
            />
          </div>
          <div
            className={cls.view}
            data-active={searchOpen}
            aria-hidden={!searchOpen}
            inert={!searchOpen}
          >
            <Box
              surface="ambient"
              elevated="md"
              full="width"
              border
              className={cls.searchSurface}
            >
              <BibleSearch
                initialTranslation={translationId}
                isActive={searchOpen}
                onSelect={() => setSearchOpen(false)}
              />
            </Box>
          </div>
        </div>
      </section>
      <AnnotationPane accountDid={accountDid} className={cls.annotationPane} />
    </main>
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
  const annotations = useChapterAnnotations(accountDid, location);
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
