import { Button, Icon, Tooltip } from '@a-type/ui';

import type { LocalAnnotation } from '#/lib/annotations/types';
import type { VerseId } from '#/lib/bible/verse';
import { formatVerseAnchorName } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import cls from './VerseGutter.module.css';

export interface VerseGutterProps {
  selectedVerses: readonly VerseId[];
  annotations: readonly LocalAnnotation[];
  onAdd: () => void;
  onOpen: (annotationId: string) => void;
  onClear: () => void;
}

export function VerseGutter({
  selectedVerses,
  annotations,
  onAdd,
  onOpen,
  onClear,
}: VerseGutterProps) {
  const anchorVerse = selectedVerses.at(0);

  if (anchorVerse) {
    return (
      <div className={cls.gutter}>
        <div
          className={cls.controls}
          style={{ positionAnchor: formatVerseAnchorName(anchorVerse) }}
        >
          <Tooltip content={m.annotation_add()}>
            <Button aria-label={m.annotation_add()} onClick={onAdd}>
              <Icon name="add_note" />
            </Button>
          </Tooltip>
          <Tooltip content={m.annotation_clear_selection()}>
            <Button
              aria-label={m.annotation_clear_selection()}
              onClick={onClear}
            >
              <Icon name="x" />
            </Button>
          </Tooltip>
        </div>
      </div>
    );
  }

  const annotationsByVerse = annotations.reduce((groups, annotation) => {
    const verseId = annotation.verses[0];
    const group = groups.get(verseId) ?? [];
    group.push(annotation);
    groups.set(verseId, group);
    return groups;
  }, new Map<VerseId, LocalAnnotation[]>());

  return (
    <div className={cls.gutter}>
      {[...annotationsByVerse].map(([verseId, verseAnnotations]) => (
        <div
          key={verseId}
          className={cls.indicators}
          style={{ positionAnchor: formatVerseAnchorName(verseId) }}
        >
          {verseAnnotations.map((annotation) => (
            <Button
              key={annotation.id}
              className={cls.indicator}
              aria-label={m.annotation_indicator()}
              onClick={() => onOpen(annotation.id)}
            >
              <Icon name="chat" />
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}
