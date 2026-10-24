import { Store } from '@tanstack/react-store';

import type { VerseId } from '#/lib/bible/verse';

export interface AnnotationPaneState {
  phase: 'closed' | 'editing' | 'adding-verses';
  draftVerses: readonly VerseId[];
}

const initialState: AnnotationPaneState = {
  phase: 'closed',
  draftVerses: [],
};

export const annotationPaneStore = new Store<AnnotationPaneState>(initialState);

export const annotationPaneActions = {
  reset: () => annotationPaneStore.setState(() => initialState),
  openEditor: (selectedVerse: VerseId) =>
    annotationPaneStore.setState(() => ({
      phase: 'editing',
      draftVerses: [selectedVerse],
    })),
  selectPrimaryVerse: (verseId: VerseId) =>
    annotationPaneStore.setState((state) =>
      state.phase === 'editing' ? { ...state, draftVerses: [verseId] } : state,
    ),
  setAddingVerses: (addingVerses: boolean) =>
    annotationPaneStore.setState((state) =>
      state.phase === 'closed'
        ? state
        : {
            ...state,
            phase: addingVerses ? 'adding-verses' : 'editing',
          },
    ),
  toggleDraftVerse: (verseId: VerseId) => {
    const state = annotationPaneStore.state;
    if (state.phase !== 'adding-verses' || state.draftVerses[0] === verseId)
      return;

    annotationPaneStore.setState((current) => {
      if (
        current.phase !== 'adding-verses' ||
        current.draftVerses[0] === verseId
      )
        return current;
      if (!current.draftVerses.includes(verseId)) {
        return {
          ...current,
          draftVerses: [...current.draftVerses, verseId],
        };
      }
      if (current.draftVerses.length === 1) return current;
      return {
        ...current,
        draftVerses: current.draftVerses.filter(
          (selected) => selected !== verseId,
        ),
      };
    });
  },
};
