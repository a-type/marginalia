import type { VerseId } from '#/lib/bible/verse';
import { formatVerseAnchorName } from '#/lib/bible/verse';
import type { AnnotationWithVerses } from './useChapterAnnotations';
import cls from './VerseGutter.module.css';

export interface VerseGutterProps {
  annotations: readonly AnnotationWithVerses[];
}

export function VerseGutter({ annotations }: VerseGutterProps) {
  const annotationsByVerse = annotations.reduce((groups, annotation) => {
    if (!annotation.comment) return groups;

    const verseId = annotation.verses[0];
    const group = groups.get(verseId) ?? [];
    group.push(annotation);
    groups.set(verseId, group);
    return groups;
  }, new Map<VerseId, AnnotationWithVerses[]>());

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
              className={`${cls.indicator} @mode-${annotation.color ?? 'neutral'}`}
              aria-hidden="true"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
