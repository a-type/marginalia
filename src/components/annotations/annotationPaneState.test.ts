import { beforeEach, describe, expect, it } from 'vitest';

import {
  annotationPaneActions,
  annotationPaneStore,
} from './annotationPaneState';

beforeEach(() => annotationPaneActions.reset());

describe('annotation pane state', () => {
  it('moves through the editor phases', () => {
    annotationPaneActions.openEditor('GEN/1:1');
    expect(annotationPaneStore.state).toEqual({
      phase: 'editing',
      draftVerses: ['GEN/1:1'],
    });

    annotationPaneActions.setAddingVerses(true);
    expect(annotationPaneStore.state.phase).toBe('adding-verses');

    annotationPaneActions.setAddingVerses(false);
    expect(annotationPaneStore.state.phase).toBe('editing');

    annotationPaneActions.reset();
    expect(annotationPaneStore.state).toEqual({
      phase: 'closed',
      draftVerses: [],
    });
  });

  it('adds and removes secondary verses without removing the primary verse', () => {
    annotationPaneActions.openEditor('GEN/1:1');
    annotationPaneActions.setAddingVerses(true);

    annotationPaneActions.toggleDraftVerse('GEN/1:2', false);
    expect(annotationPaneStore.state.draftVerses).toEqual([
      'GEN/1:1',
      'GEN/1:2',
    ]);

    annotationPaneActions.toggleDraftVerse('GEN/1:1', true);
    annotationPaneActions.toggleDraftVerse('GEN/1:2', false);
    expect(annotationPaneStore.state.draftVerses).toEqual(['GEN/1:1']);
  });
});
