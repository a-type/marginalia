import { useDbClient, useLiveQuery } from '@tanstack/react-db';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAnnotationCollections } from '../../lib/annotations/collections';
import {
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

function useBibleSearchState(
  initialTranslation: string,
  isActive: boolean,
  onSelect?: () => void,
) {
  const [translationId, setTranslationId] = useState(initialTranslation);
  const [bookId, setBookId] = useState('all');
  const [rawQuery, setRawQuery] = useState('');
  const [query] = useDebouncedValue(rawQuery, { wait: 300 });
  const [page, setPage] = useState(0);
  const [myNotes, setMyNotes] = useState(false);
  const [myHighlights, setMyHighlights] = useState(false);
  const [annotationOrder, setAnnotationOrder] = useState<'oldest' | 'newest'>(
    'newest',
  );
  useEffect(() => {
    if (!isActive) return;
    setTranslationId(initialTranslation);
    setBookId('all');
    setRawQuery('');
    setPage(0);
    setMyNotes(false);
    setMyHighlights(false);
    setAnnotationOrder('newest');
  }, [initialTranslation, isActive]);

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
    record?.sourceStatus === 'ready' && record.searchStatus === 'ready';
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
  const navigate = useNavigate();
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
    onTranslationChange: (id: string) => {
      setTranslationId(id);
      setBookId('all');
      setPage(0);
    },
    onQueryChange: (value: string) => {
      setRawQuery(value);
      setPage(0);
    },
    onBookChange: (value: string | null) => {
      if (!value) return;
      setBookId(value);
      setPage(0);
    },
    myNotes,
    myAnnotations,
    myHighlights,
    annotationOrder,
    onMyNotesChange: (value: boolean) => {
      setMyNotes(value);
      setPage(0);
    },
    onMyHighlightsChange: (value: boolean) => {
      setMyHighlights(value);
      setPage(0);
    },
    onAnnotationOrderChange: (value: string | null) => {
      if (value === 'oldest' || value === 'newest') {
        setAnnotationOrder(value);
        setPage(0);
      }
    },
    annotationError:
      hasAnnotationFilter &&
      (account.isError || notesQuery.isError || highlightsQuery.isError),
    annotationsReady,
    searching: Boolean(query.trim()) || hasAnnotationFilter,
    onSelectVerse: (id: Parameters<typeof parseVerseId>[0]) =>
      select.mutate(id),
    previousPage: () => setPage(page - 1),
    nextPage: () => setPage(page + 1),
  };
}

const BibleSearchContext = createContext<ReturnType<
  typeof useBibleSearchState
> | null>(null);

export function BibleSearchProvider({
  initialTranslation,
  isActive,
  onSelect,
  children,
}: {
  initialTranslation: string;
  isActive: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const value = useBibleSearchState(initialTranslation, isActive, onSelect);
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
