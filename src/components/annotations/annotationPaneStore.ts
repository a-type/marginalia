import { createStore } from '@tanstack/store';

import {
  formatVerseSelection,
  parseVerseSelection,
} from '#/lib/bible/selection';
import type { VerseId } from '#/lib/bible/verse';
import { formatVerseId, parseVerseId } from '#/lib/bible/verse';
import { verseAnnotationsQueryOptions } from '#/queries/annotations';
import { userAccountQueryOptions } from '#/queries/user';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';

export interface AnnotationPaneState {
  addingVerses: boolean;
  draftVerses: readonly VerseId[];
  editing: boolean;
}

const initialState: AnnotationPaneState = {
  addingVerses: false,
  draftVerses: [],
  editing: false,
};

export function createAnnotationPaneStore() {
  return createStore(initialState, ({ setState }) => ({
    reset: () => setState(() => initialState),
    openEditor: (selectedVerse: VerseId) =>
      setState(() => ({
        addingVerses: false,
        draftVerses: [selectedVerse],
        editing: true,
      })),
    setAddingVerses: (addingVerses: boolean) =>
      setState((state) => ({ ...state, addingVerses })),
    toggleDraftVerse: (verseId: VerseId, selectedVerse: VerseId) =>
      setState((state) => {
        if (!state.editing || !state.addingVerses) return state;
        if (verseId === selectedVerse) return state;
        if (!state.draftVerses.includes(verseId)) {
          return {
            ...state,
            draftVerses: [...state.draftVerses, verseId],
          };
        }
        if (state.draftVerses.length === 1) return state;
        return {
          ...state,
          draftVerses: state.draftVerses.filter(
            (selected) => selected !== verseId,
          ),
        };
      }),
  }));
}

export const annotationPaneStore = createAnnotationPaneStore();

const readerRoute = getRouteApi('/$translation/$book/$chapter');

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
  if (openAnnotationIndex === -1) {
    openAnnotationIndex = 0;
  }
  const openAnnotation = selectedVerseAnnotations.at(openAnnotationIndex);
  const nextAnnotation = selectedVerseAnnotations.at(
    (openAnnotationIndex + 1) % selectedVerseAnnotations.length,
  );
  const previousAnnotation = selectedVerseAnnotations.at(
    (openAnnotationIndex - 1 + selectedVerseAnnotations.length) %
      selectedVerseAnnotations.length,
  );
  return {
    current: openAnnotation,
    next: nextAnnotation,
    previous: previousAnnotation,
    index: openAnnotationIndex,
    total: selectedVerseAnnotations.length,
  };
}

export function useIsAnnotationPaneActive() {
  const search = readerRoute.useSearch();
  const editing = useSelector(annotationPaneStore, (state) => state.editing);
  const selectedAnnotations = usePrimarySelectedVerseAnnotations();
  return !!search.annotation || editing || selectedAnnotations.length > 0;
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
  const draftVerses = useSelector(
    annotationPaneStore,
    (state) => state.draftVerses,
  );
  const editing = useSelector(annotationPaneStore, (state) => state.editing);
  const selectedVerse = usePrimarySelectedVerseId();
  const selectedSet = new Set(
    editing ? draftVerses : selectedVerse ? [selectedVerse] : [],
  );
  return selectedSet.has(verseId);
}

export function useToggleVerseSelected(verseId: VerseId) {
  const editing = useSelector(annotationPaneStore, (state) => state.editing);
  const selectedVerse = usePrimarySelectedVerseId();
  const setSelectedNumber = useSetSelectedVerseNumber();
  return () => {
    if (editing) {
      if (selectedVerse) {
        annotationPaneStore.actions.toggleDraftVerse(verseId, selectedVerse);
      }
      return;
    }

    void setSelectedNumber(
      selectedVerse === verseId ? undefined : parseVerseId(verseId).verse,
    );
  };
}

export function useVerseAnnotations(verseId: VerseId | null) {
  const { data: account } = useSuspenseQuery(userAccountQueryOptions);
  const { data: annotations } = useQuery(
    verseAnnotationsQueryOptions(account?.did ?? null, verseId),
  );
  return annotations ?? [];
}

export function usePrimarySelectedVerseAnnotations() {
  const selectedVerse = usePrimarySelectedVerseId();
  return useVerseAnnotations(selectedVerse ?? null);
}

export function useVerseIncludedInOpenAnnotation(verseId: VerseId) {
  const search = readerRoute.useSearch();
  const annotations = usePrimarySelectedVerseAnnotations();
  const openAnnotationId = search.annotation;
  return annotations.some(
    (annotation) =>
      annotation.id === openAnnotationId && annotation.verses.includes(verseId),
  );
}
