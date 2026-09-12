import { Button, Icon } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';

import { formatVerseAnchorName } from '#/lib/bible/verse';
import { createHighlight } from '#/lib/highlights/create';
import { highlightColors } from '#/lib/highlights/types';
import { annotationPaneActions } from './annotationPaneState';
import {
  useIsAnnotationPaneActive,
  usePrimarySelectedVerseId,
  useSetSelectedVerseNumber,
} from './annotationPaneStore';
import cls from './AnnotationToolbar.module.css';

export function AnnotationToolbar() {
  const dbClient = useDbClient();
  const selectedVerse = usePrimarySelectedVerseId();
  const setSelectedVerseNumber = useSetSelectedVerseNumber();
  const paneOpen = useIsAnnotationPaneActive();

  if (!selectedVerse || paneOpen) return null;

  return (
    <div
      className={cls.toolbar}
      style={{ positionAnchor: formatVerseAnchorName(selectedVerse) }}
    >
      <Button
        size="small"
        emphasis="ghost"
        aria-label="Deselect verse"
        onClick={() => setSelectedVerseNumber()}
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
        emphasis="ghost"
        aria-label="Add annotation"
        onClick={() => annotationPaneActions.openEditor(selectedVerse)}
      >
        <Icon name="plus" />
      </Button>
    </div>
  );
}
