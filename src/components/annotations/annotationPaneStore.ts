import { and, eq, useDbClient, useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useEffect } from 'react';

import {
  annotationCollectionOptions,
  annotationVerseCollectionOptions,
  getAnnotationCollections,
} from '#/lib/annotations/collections';
import {
  formatVerseSelection,
  parseVerseSelection,
} from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';
import { formatVerseId, parseVerseId } from '#/lib/bible/verse';
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
  const selectedAnnotations = usePrimarySelectedVerseAnnotations();
  return !!explicitAnnotation || editing || selectedAnnotations.length > 0;
}

export function useSetSelectedVerseNumber() {
  const navigate = readerRoute.useNavigate();
  return (verse?: number, annotation?: string) =>
    navigate({
      search: {
        ...(verse ? { verses: formatVerseSelection([verse]) } : {}),
        ...(annotation ? { annotation } : {}),
      },
      replace: true,
      resetScroll: false,
    });
}

export function usePrimarySelectedVerseId() {
  const selectedNumber = readerRoute.useSearch({
    select: (s) => parseVerseSelection(s.verses).at(0),
  });
  const { location } = readerRoute.useLoaderData();
  return selectedNumber
    ? formatVerseId(location.bookId, location.chapter, selectedNumber)
    : undefined;
}

export function useIsSelectedVerse(verseId: VerseId) {
  const editing = useStore(
    annotationPaneStore,
    (state) => state.phase !== 'closed',
  );
  const includedInDraft = useStore(annotationPaneStore, (state) =>
    state.phase === 'closed' ? false : state.draftVerses.includes(verseId),
  );
  const primarySelected = readerRoute.useSearch({
    select: (search) =>
      parseVerseSelection(search.verses).at(0) === parseVerseId(verseId).verse,
  });
  return editing ? includedInDraft : primarySelected;
}

export function useToggleVerseSelected(
  verseId: VerseId,
  firstAnnotationId?: string,
) {
  const primarySelected = readerRoute.useSearch({
    select: (search) =>
      parseVerseSelection(search.verses).at(0) === parseVerseId(verseId).verse,
  });
  const setSelectedNumber = useSetSelectedVerseNumber();
  return () => {
    if (annotationPaneStore.state.phase !== 'closed') {
      annotationPaneActions.toggleDraftVerse(verseId, primarySelected);
      return;
    }

    void setSelectedNumber(
      primarySelected ? undefined : parseVerseId(verseId).verse,
      primarySelected ? undefined : firstAnnotationId,
    );
  };
}

export function useVerseAnnotations(verseId: VerseId | null) {
  const { data } = useLiveQuery({
    query: (query) => {
      if (!verseId) return undefined;
      return query
        .from({ annotationVerse: annotationVerseCollectionOptions })
        .innerJoin(
          { annotation: annotationCollectionOptions },
          ({ annotation, annotationVerse }) =>
            eq(annotation.id, annotationVerse.annotationId),
        )
        .where(({ annotationVerse }) => eq(annotationVerse.verseId, verseId))
        .orderBy(({ annotation }) => annotation.createdAt, 'desc')
        .select(({ annotation }) => ({ ...annotation }));
    },
  });
  return data ?? [];
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
        .from({ annotationVerse: annotationVerseCollectionOptions })
        .where(({ annotationVerse }) =>
          eq(annotationVerse.annotationId, annotationId),
        )
        .orderBy(({ annotationVerse }) => annotationVerse.ordinal)
        .select(({ annotationVerse }) => ({
          id: annotationVerse.id,
          verseId: annotationVerse.verseId,
        }));
    },
  });
  return (data ?? []).map((annotationVerse) => annotationVerse.verseId);
}

export function useVerseIncludedInOpenAnnotation(verseId: VerseId) {
  const annotationId = readerRoute.useSearch({
    select: (search) => search.annotation,
  });
  const { data } = useLiveQuery({
    query: (query) => {
      if (!annotationId) return undefined;
      return query
        .from({ annotationVerse: annotationVerseCollectionOptions })
        .where(({ annotationVerse }) =>
          and(
            eq(annotationVerse.annotationId, annotationId),
            eq(annotationVerse.verseId, verseId),
          ),
        )
        .select(({ annotationVerse }) => ({ id: annotationVerse.id }));
    },
  });
  return (data?.length ?? 0) > 0;
}

export function useAnnotationCollections() {
  return getAnnotationCollections(useDbClient());
}
