import { eq, useDbClient, useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

import {
  annotationCollectionOptions,
  annotationPaneCollectionOptions,
  annotationVerseCollectionOptions,
  getAnnotationCollections,
} from '#/lib/annotations/collections';
import type { AnnotationPaneRecord } from '#/lib/annotations/collections';
import {
  formatVerseSelection,
  parseVerseSelection,
} from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';
import { formatVerseId, parseVerseId } from '#/lib/bible/verse';

const PANE_ID = 'annotation-pane';
const initialPaneState: AnnotationPaneRecord = {
  id: PANE_ID,
  addingVerses: false,
  draftVerses: [],
  editing: false,
};

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export function useAnnotationPaneState() {
  const { data } = useLiveQuery({
    query: (query) =>
      query
        .from({ pane: annotationPaneCollectionOptions })
        .where(({ pane }) => eq(pane.id, PANE_ID))
        .findOne(),
  });
  return data ?? initialPaneState;
}

export function useAnnotationPaneActions() {
  const dbClient = useDbClient();
  const pane = dbClient.collection(annotationPaneCollectionOptions);

  return {
    reset: () =>
      pane.update(PANE_ID, (draft) => {
        draft.addingVerses = false;
        draft.draftVerses = [];
        draft.editing = false;
      }),
    openEditor: (selectedVerse: VerseId) =>
      pane.update(PANE_ID, (draft) => {
        draft.addingVerses = false;
        draft.draftVerses = [selectedVerse];
        draft.editing = true;
      }),
    setAddingVerses: (addingVerses: boolean) =>
      pane.update(PANE_ID, (draft) => {
        draft.addingVerses = addingVerses;
      }),
    toggleDraftVerse: (verseId: VerseId, selectedVerse: VerseId) => {
      const state = pane.get(PANE_ID);
      if (!state?.editing || !state.addingVerses || verseId === selectedVerse) {
        return;
      }
      pane.update(PANE_ID, (draft) => {
        if (draft.draftVerses.includes(verseId)) {
          if (draft.draftVerses.length > 1) {
            draft.draftVerses = draft.draftVerses.filter(
              (selected) => selected !== verseId,
            );
          }
        } else {
          draft.draftVerses.push(verseId);
        }
      });
    },
  };
}

export function useResetAnnotationPaneOnRouteChange() {
  const dbClient = useDbClient();
  const search = readerRoute.useSearch();
  const { location } = readerRoute.useLoaderData();

  useEffect(() => {
    const pane = dbClient.collection(annotationPaneCollectionOptions);
    let cancelled = false;
    void pane.preload().then(() => {
      if (cancelled) return;
      pane.update(PANE_ID, (draft) => {
        draft.addingVerses = false;
        draft.draftVerses = [];
        draft.editing = false;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    dbClient,
    location.bookId,
    location.chapter,
    search.annotation,
    search.verses,
  ]);
}

export function useSetOpenAnnotation() {
  const navigate = readerRoute.useNavigate();
  return (annotation?: string) => {
    navigate({
      from: '/$translation/$book/$chapter',
      search: (search) => ({
        ...(search.verses ? { verses: search.verses } : {}),
        ...(annotation ? { annotation } : {}),
      }),
      replace: true,
      resetScroll: false,
    });
  };
}

export function useOpenAnnotation() {
  const search = readerRoute.useSearch();
  const selectedVerseAnnotations = usePrimarySelectedVerseAnnotations();

  let openAnnotationIndex = selectedVerseAnnotations.findIndex(
    (annotation) => annotation.id === search.annotation,
  );
  if (openAnnotationIndex === -1) openAnnotationIndex = 0;

  return {
    current: selectedVerseAnnotations.at(openAnnotationIndex),
    next: selectedVerseAnnotations.at(
      (openAnnotationIndex + 1) % selectedVerseAnnotations.length,
    ),
    previous: selectedVerseAnnotations.at(
      (openAnnotationIndex - 1 + selectedVerseAnnotations.length) %
        selectedVerseAnnotations.length,
    ),
    index: openAnnotationIndex,
    total: selectedVerseAnnotations.length,
  };
}

export function useIsAnnotationPaneActive() {
  const search = readerRoute.useSearch();
  const pane = useAnnotationPaneState();
  const selectedAnnotations = usePrimarySelectedVerseAnnotations();
  return !!search.annotation || pane.editing || selectedAnnotations.length > 0;
}

export function useSetSelectedVerseNumber() {
  const navigate = readerRoute.useNavigate();
  return (verse?: number) =>
    navigate({
      search: {
        ...(verse ? { verses: formatVerseSelection([verse]) } : {}),
      },
      replace: true,
      resetScroll: false,
    });
}

export function usePrimarySelectedVerseId() {
  const search = readerRoute.useSearch();
  const { location } = readerRoute.useLoaderData();
  const selectedNumber = parseVerseSelection(search.verses).at(0);
  return selectedNumber
    ? formatVerseId(location.bookId, location.chapter, selectedNumber)
    : undefined;
}

export function useIsSelectedVerse(verseId: VerseId) {
  const pane = useAnnotationPaneState();
  const selectedVerse = usePrimarySelectedVerseId();
  return pane.editing
    ? pane.draftVerses.includes(verseId)
    : selectedVerse === verseId;
}

export function useToggleVerseSelected(verseId: VerseId) {
  const pane = useAnnotationPaneState();
  const actions = useAnnotationPaneActions();
  const selectedVerse = usePrimarySelectedVerseId();
  const setSelectedNumber = useSetSelectedVerseNumber();
  return () => {
    if (pane.editing) {
      if (selectedVerse) actions.toggleDraftVerse(verseId, selectedVerse);
      return;
    }

    void setSelectedNumber(
      selectedVerse === verseId ? undefined : parseVerseId(verseId).verse,
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
  const { current: openAnnotation } = useOpenAnnotation();
  const { data } = useLiveQuery({
    query: (query) => {
      if (!openAnnotation) return undefined;
      return query
        .from({ annotationVerse: annotationVerseCollectionOptions })
        .where(({ annotationVerse }) =>
          eq(annotationVerse.annotationId, openAnnotation.id),
        )
        .where(({ annotationVerse }) => eq(annotationVerse.verseId, verseId))
        .findOne();
    },
  });
  return !!data;
}

export function useAnnotationCollections() {
  return getAnnotationCollections(useDbClient());
}
