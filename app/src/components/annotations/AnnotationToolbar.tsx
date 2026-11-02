import { Button, Icon, Text } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';

import { m } from '#/paraglide/messages';
import { createHighlight } from '../../lib/highlights/create';
import { highlightColors } from '../../lib/highlights/types';
import { InterlinearDialog } from '../bible/interlinear/InterlinearDialog';
import { annotationPaneActions } from './annotationPaneState';
import {
  useIsAnnotationPaneActive,
  usePrimarySelectedVerseId,
  useSetSelectedVerseId,
} from './annotationPaneStore';
import cls from './AnnotationToolbar.module.css';
import { useSelectedVerseIds } from './VerseSelection';

export function AnnotationToolbar() {
  const dbClient = useDbClient();
  const selectedVerse = usePrimarySelectedVerseId();
  const selectedVerses = useSelectedVerseIds();
  const setSelectedVerse = useSetSelectedVerseId();
  const paneOpen = useIsAnnotationPaneActive();

  if (!selectedVerse || paneOpen) return null;

  return (
    <div className={cls.toolbar}>
      <Button
        size="small"
        emphasis="ghost"
        aria-label="Deselect verse"
        onClick={() => setSelectedVerse()}
      >
        <Icon name="x" />
      </Button>
      {highlightColors.map((color) => (
        <Button
          key={color}
          size="small"
          emphasis="ghost"
          aria-label={`Highlight ${color}`}
          className={`@mode-${color}`}
          onClick={() =>
            void createHighlight(dbClient, { verseId: selectedVerse, color })
          }
        >
          <span className={cls.swatch} />
        </Button>
      ))}
      <Button
        size="small"
        emphasis="light"
        aria-label="Add annotation"
        onClick={() => annotationPaneActions.openEditor(selectedVerses)}
      >
        <Icon name="plus" />
      </Button>
      <InterlinearDialog aria-label={m.interlinear_open()}>
        <Button.Icon>
          <Text bold>α</Text>
        </Button.Icon>
      </InterlinearDialog>
    </div>
  );
}
