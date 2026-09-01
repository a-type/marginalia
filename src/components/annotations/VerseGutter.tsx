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
  onClear: () => void;
}

export function VerseGutter({
  selectedVerses,
  annotations,
  onAdd,
  onClear,
}: VerseGutterProps) {
  const anchorVerse = selectedVerses.at(0);

  // In CSS, anchored elements cannot be mounted before their anchor targets.
  // To work around timing issues,

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
            <span
              key={annotation.id}
              className={cls.indicator}
              role="img"
              aria-label={m.annotation_indicator()}
            >
              <Icon name="chat" />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
