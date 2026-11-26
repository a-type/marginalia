import { useDbClient, useLiveQuery } from '@tanstack/react-db';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { getAnnotationCollections } from '../../lib/annotations/collections';
import {
  corpusVersion,
  getAnnotatedVerseIds,
  isMySearchAnnotation,
} from '../../lib/bible/search';
import { downloadTranslation } from '../../lib/bible/translation-jobs';
import { parseVerseId } from '../../lib/bible/verse';
import { getHighlightCollections } from '../../lib/highlights/collections';
import {
  bibleSearchQueryOptions,
  translationsQueryOptions,
} from '../../queries/translations';
import { currentUserDidQueryOptions } from '../../queries/user';

const searchRoute = getRouteApi('/search');

function useBibleSearchState(
  initialTranslation: string,
  onSelect?: () => void,
) {
  const search = searchRoute.useSearch();
  const navigate = useNavigate({ from: '/search' });
  const translationId = search.translation ?? initialTranslation;
  const bookId = search.book ?? 'all';
  const rawQuery = search.q ?? '';
  const [query] = useDebouncedValue(rawQuery, { wait: 300 });
  const page = (search.page ?? 1) - 1;
  const myNotes = search.notes === true;
  const myHighlights = search.highlights === true;
  const annotationOrder = search.order ?? 'newest';
  const updateSearch = (patch: Partial<typeof search>, replace = false) => {
    void navigate({
      replace,
      search: (previous) => ({
        ...previous,
        translation: previous.translation ?? initialTranslation,
        ...patch,
      }),
    });
  };

  const dbClient = useDbClient();
  const annotations = getAnnotationCollections(dbClient).annotations;
  const highlights = getHighlightCollections(dbClient).highlights;
  const notesQuery = useLiveQuery({
    query: (q) => (myNotes ? q.from({ annotation: annotations }) : undefined),
  });
  const highlightsQuery = useLiveQuery({
    query: (q) =>
      myHighlights ? q.from({ highlight: highlights }) : undefined,
  });
  const hasAnnotationFilter = myNotes || myHighlights;
  const account = useQuery({
    ...currentUserDidQueryOptions,
    enabled: hasAnnotationFilter,
    networkMode: 'always',
  });
  const annotationsReady =
    !hasAnnotationFilter ||
    (account.isSuccess &&
      (!myNotes || notesQuery.isReady) &&
      (!myHighlights || highlightsQuery.isReady));
  const myAnnotations =
    myNotes && account.isSuccess
      ? (notesQuery.data ?? []).filter((note) =>
          isMySearchAnnotation(note.authorDid, account.data ?? null),
        )
      : [];
  const verseIds =
    hasAnnotationFilter && annotationsReady
      ? getAnnotatedVerseIds(
          myAnnotations,
          myHighlights ? (highlightsQuery.data ?? []) : [],
          account.data ?? null,
          annotationOrder,
        )
      : undefined;
  const translations = useQuery(translationsQueryOptions);
  const record = translations.data?.find(
    (translation) => translation.id === translationId,
  );
  const ready =
    record?.sourceStatus === 'ready' &&
    record.searchStatus === 'ready' &&
    record.corpusVersion === corpusVersion;
  const results = useQuery({
    ...bibleSearchQueryOptions(
      translationId,
      query,
      page,
      bookId === 'all' ? undefined : bookId,
      verseIds,
    ),
    enabled:
      ready &&
      annotationsReady &&
      (Boolean(query.trim()) || hasAnnotationFilter) &&
      rawQuery === query,
  });
  const download = useMutation({
    networkMode: 'always',
    mutationFn: () => downloadTranslation(translationId),
  });
  const select = useMutation({
    networkMode: 'always',
    mutationFn: async (id: Parameters<typeof parseVerseId>[0]) => {
      const verse = parseVerseId(id);
      await navigate({
        to: '/$translation/$book/$chapter',
        params: {
          translation: translationId,
          book: verse.bookId,
          chapter: String(verse.chapter),
        },
        search: { verses: id },
        hash: `verse-${id}`,
        hashScrollIntoView: { block: 'start', behavior: 'instant' },
      });
      onSelect?.();
    },
  });
  const shown =
    ready &&
    annotationsReady &&
    (Boolean(query.trim()) || hasAnnotationFilter) &&
    rawQuery === query &&
    !results.isFetching
      ? results.data
      : undefined;

  return {
    translationId,
    bookId,
    rawQuery,
    query,
    page,
    translations,
    record,
    ready,
    results,
    download,
    select,
    shown,
    onTranslationChange: (id: string) =>
      updateSearch({ translation: id, book: undefined, page: undefined }),
    onQueryChange: (value: string) =>
      updateSearch({ q: value || undefined, page: undefined }, true),
    onBookChange: (value: string | null) => {
      if (!value) return;
      updateSearch({
        book: value === 'all' ? undefined : value,
        page: undefined,
      });
    },
    myNotes,
    myAnnotations,
    myHighlights,
    annotationOrder,
    onMyNotesChange: (value: boolean) =>
      updateSearch({ notes: value ? true : undefined, page: undefined }),
    onMyHighlightsChange: (value: boolean) =>
      updateSearch({ highlights: value ? true : undefined, page: undefined }),
    onAnnotationOrderChange: (value: string | null) => {
      if (value === 'oldest' || value === 'newest') {
        updateSearch({
          order: value === 'oldest' ? value : undefined,
          page: undefined,
        });
      }
    },
    annotationError:
      hasAnnotationFilter &&
      (account.isError || notesQuery.isError || highlightsQuery.isError),
    annotationsReady,
    searching: Boolean(query.trim()) || hasAnnotationFilter,
    onSelectVerse: (id: Parameters<typeof parseVerseId>[0]) =>
      select.mutate(id),
    previousPage: () => updateSearch({ page: page > 1 ? page : undefined }),
    nextPage: () => updateSearch({ page: page + 2 }),
  };
}

const BibleSearchContext = createContext<ReturnType<
  typeof useBibleSearchState
> | null>(null);

export function BibleSearchProvider({
  initialTranslation,
  onSelect,
  children,
}: {
  initialTranslation: string;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const value = useBibleSearchState(initialTranslation, onSelect);
  return (
    <BibleSearchContext.Provider value={value}>
      {children}
    </BibleSearchContext.Provider>
  );
}

export function useBibleSearch() {
  const context = useContext(BibleSearchContext);
  if (!context) {
    throw new Error('useBibleSearch must be used within a BibleSearchProvider');
  }
  return context;
}
