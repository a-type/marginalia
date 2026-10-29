import {
  and,
  eq,
  inArray,
  useDbClient,
  useLiveQuery,
} from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useEffect } from 'react';

import {
  annotationCollectionOptions,
  getAnnotationCollections,
} from '#/lib/annotations/collections';
import { formatVerseSelection } from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';
import { parseVerseId } from '#/lib/bible/verse';
import { useSelectedVerseIds } from './VerseSelection';
import {
  annotationPaneActions,
  annotationPaneStore,
} from './annotationPaneState';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export function useAnnotationPaneState() {
  const phase = useStore(annotationPaneStore, (state) => state.phase);
  const draftVerses = useStore(
    annotationPaneStore,
    (state) => state.draftVerses,
  );
  return {
    addingVerses: phase === 'adding-verses',
    draftVerses,
    editing: phase !== 'closed',
  };
}

export function useResetAnnotationPaneOnRouteChange() {
  const search = readerRoute.useSearch();
  const { location } = readerRoute.useLoaderData();

  useEffect(() => {
    annotationPaneActions.reset();
  }, [location.bookId, location.chapter, search.annotation, search.verses]);
}

export function useSetOpenAnnotation() {
  const navigate = readerRoute.useNavigate();
  return (annotation?: string) => {
    navigate({
      from: '/$translation/$book/$chapter',
      search: (search) => ({
        ...(search.verses ? { verses: search.verses } : {}),
        ...(search.verses && annotation ? { annotation } : {}),
      }),
      replace: true,
      resetScroll: false,
    });
  };
}

export function useOpenAnnotation() {
  const explicitAnnotation = readerRoute.useSearch({
    select: (s) => s.annotation,
  });
  const selectedVerseAnnotations = usePrimarySelectedVerseAnnotations();

  const openAnnotationIndex = selectedVerseAnnotations.findIndex(
    (annotation) => annotation.id === explicitAnnotation,
  );
  const hasOpenAnnotation = openAnnotationIndex >= 0;

  return {
    current: hasOpenAnnotation
      ? selectedVerseAnnotations.at(openAnnotationIndex)
      : undefined,
    next: hasOpenAnnotation
      ? selectedVerseAnnotations.at(
          (openAnnotationIndex + 1) % selectedVerseAnnotations.length,
        )
      : undefined,
    previous: hasOpenAnnotation
      ? selectedVerseAnnotations.at(
          (openAnnotationIndex - 1 + selectedVerseAnnotations.length) %
            selectedVerseAnnotations.length,
        )
      : undefined,
    index: openAnnotationIndex,
    total: selectedVerseAnnotations.length,
  };
}

export function useIsAnnotationPaneActive() {
  const explicitAnnotation = readerRoute.useSearch({
    select: (s) => s.annotation,
  });
  const editing = useStore(
    annotationPaneStore,
    (state) => state.phase !== 'closed',
  );
  return !!explicitAnnotation || editing;
}

export function useSetSelectedVerseNumber() {
  const navigate = readerRoute.useNavigate();
  return (verse?: number, annotation?: string) =>
    navigate({
      search: {
        ...(verse ? { verses: formatVerseSelection([verse]) } : {}),
        ...(annotation ? { annotation } : {}),
      },
      state: (previous) => previous,
      replace: true,
      resetScroll: false,
    });
}

export function usePrimarySelectedVerseId() {
  return useSelectedVerseIds().at(0);
}

export function useIsSelectedVerse(verseId: VerseId) {
  const editing = useStore(
    annotationPaneStore,
    (state) => state.phase !== 'closed',
  );
  const includedInDraft = useStore(annotationPaneStore, (state) =>
    state.phase === 'closed' ? false : state.draftVerses.includes(verseId),
  );
  const selected = useSelectedVerseIds().includes(verseId);
  return editing ? includedInDraft : selected;
}

export function useToggleVerseSelected(verseId: VerseId) {
  const selectedVerses = useSelectedVerseIds();
  const singleSelected =
    selectedVerses.length === 1 && selectedVerses[0] === verseId;
  const setSelectedNumber = useSetSelectedVerseNumber();
  return () => {
    const phase = annotationPaneStore.state.phase;
    if (phase === 'editing') {
      annotationPaneActions.selectPrimaryVerse(verseId);
      return;
    }
    if (phase === 'adding-verses') {
      annotationPaneActions.toggleDraftVerse(verseId);
      return;
    }

    void setSelectedNumber(
      singleSelected ? undefined : parseVerseId(verseId).verse,
    );
  };
}

export function useVerseAnnotations(verseId: VerseId | null) {
  const { data } = useLiveQuery({
    query: (query) => {
      if (!verseId) return undefined;
      return query
        .from({ annotation: annotationCollectionOptions })
        .where(({ annotation }) => inArray(verseId, annotation.verses))
        .orderBy(({ annotation }) => annotation.createdAt, 'desc')
        .select(({ annotation }) => ({ ...annotation }));
    },
  });
  return verseId ? (data ?? []) : [];
}

export function usePrimarySelectedVerseAnnotations() {
  const selectedVerse = usePrimarySelectedVerseId();
  return useVerseAnnotations(selectedVerse ?? null);
}

export function useAnnotationVerseIds(annotationId: string | null) {
  const { data } = useLiveQuery({
    query: (query) => {
      if (!annotationId) return undefined;
      return query
        .from({ annotation: annotationCollectionOptions })
        .where(({ annotation }) => eq(annotation.id, annotationId))
        .select(({ annotation }) => ({ verses: annotation.verses }));
    },
  });
  return data?.[0]?.verses ?? [];
}

export function useVerseIncludedInOpenAnnotation(verseId: VerseId) {
  const annotationId = readerRoute.useSearch({
    select: (search) => search.annotation,
  });
  const { data } = useLiveQuery({
    query: (query) => {
      if (!annotationId) return undefined;
      return query
        .from({ annotation: annotationCollectionOptions })
        .where(({ annotation }) =>
          and(
            eq(annotation.id, annotationId),
            inArray(verseId, annotation.verses),
          ),
        )
        .select(({ annotation }) => ({ verses: annotation.verses }));
    },
  });
  return (data?.length ?? 0) > 0;
}

export function useAnnotationCollections() {
  return getAnnotationCollections(useDbClient());
}
