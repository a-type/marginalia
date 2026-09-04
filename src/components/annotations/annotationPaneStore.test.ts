import { describe, expect, it } from 'vitest';

import { createAnnotationPaneStore } from './annotationPaneStore';

describe('annotation pane store', () => {
  it('coordinates editor and draft verse state', () => {
    const store = createAnnotationPaneStore();

    store.actions.openEditor('GEN/1:1');
    expect(store.state).toEqual({
      addingVerses: false,
      draftVerses: ['GEN/1:1'],
      editing: true,
    });

    store.actions.setAddingVerses(true);
    store.actions.toggleDraftVerse('GEN/1:2', 'GEN/1:1');
    expect(store.state.draftVerses).toEqual(['GEN/1:1', 'GEN/1:2']);

    store.actions.toggleDraftVerse('GEN/1:1', 'GEN/1:1');
    expect(store.state.draftVerses).toEqual(['GEN/1:1', 'GEN/1:2']);

    store.actions.toggleDraftVerse('GEN/1:2', 'GEN/1:1');
    expect(store.state.draftVerses).toEqual(['GEN/1:1']);

    store.actions.reset();
    expect(store.state).toEqual({
      addingVerses: false,
      draftVerses: [],
      editing: false,
    });
  });

  it('ignores draft changes outside add-verses mode', () => {
    const store = createAnnotationPaneStore();

    store.actions.openEditor('GEN/1:1');
    store.actions.toggleDraftVerse('GEN/1:2', 'GEN/1:1');

    expect(store.state.draftVerses).toEqual(['GEN/1:1']);
  });
});
