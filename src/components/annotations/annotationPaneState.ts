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
  setAddingVerses: (addingVerses: boolean) =>
    annotationPaneStore.setState((state) =>
      state.phase === 'closed'
        ? state
        : {
            ...state,
            phase: addingVerses ? 'adding-verses' : 'editing',
          },
    ),
  toggleDraftVerse: (verseId: VerseId, primarySelected: boolean) => {
    const state = annotationPaneStore.state;
    if (state.phase !== 'adding-verses' || primarySelected) return;

    annotationPaneStore.setState((current) => {
      if (current.phase !== 'adding-verses') return current;
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
