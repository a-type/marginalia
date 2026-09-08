import type { VerseId } from '#/lib/bible/verse';
import { formatVerseAnchorName, parseVerseId } from '#/lib/bible/verse';
import { useSetSelectedVerseNumber } from './annotationPaneStore';
import type { AnnotationWithVerses } from './useChapterAnnotations';
import cls from './VerseGutter.module.css';

export interface VerseGutterProps {
  annotations: readonly AnnotationWithVerses[];
}

export function VerseGutter({ annotations }: VerseGutterProps) {
  const setSelectedVerseNumber = useSetSelectedVerseNumber();
  const annotationsByVerse = annotations.reduce((groups, annotation) => {
    for (const verseId of annotation.verses) {
      const group = groups.get(verseId) ?? [];
      group.push(annotation);
      groups.set(verseId, group);
    }
    return groups;
  }, new Map<VerseId, AnnotationWithVerses[]>());

  return (
    <div className={cls.gutter}>
      {[...annotationsByVerse].map(([verseId, verseAnnotations]) => (
        <button
          key={verseId}
          className={cls.indicators}
          style={{ positionAnchor: formatVerseAnchorName(verseId) }}
          type="button"
          aria-label={`Open ${verseAnnotations.length} annotations`}
          onClick={() =>
            setSelectedVerseNumber(
              parseVerseId(verseId).verse,
              verseAnnotations[0]?.id,
            )
          }
        >
          {verseAnnotations.map((annotation) => (
            <span
              key={annotation.id}
              className={`${cls.indicator} @mode-neutral`}
              aria-hidden="true"
            />
          ))}
        </button>
      ))}
    </div>
  );
}
