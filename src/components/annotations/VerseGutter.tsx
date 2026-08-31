import { Button, Icon, Tooltip } from '@a-type/ui';
import { useEffect, useRef, useState } from 'react';

import type { LocalAnnotation } from '#/lib/annotations/types';
import type { VerseId } from '#/lib/bible/verse';
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
  const gutterRef = useRef<HTMLDivElement>(null);
  const [fixedPosition, setFixedPosition] = useState<number | null>(null);
  const [versePositions, setVersePositions] = useState<Map<VerseId, number>>(
    new Map(),
  );
  const anchorVerse = selectedVerses.at(0);

  useEffect(() => {
    const update = () => {
      const container = gutterRef.current?.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const verseIds = anchorVerse
        ? [anchorVerse]
        : annotations.map((annotation) => annotation.verses[0]);
      setVersePositions(
        new Map(
          verseIds.flatMap((verseId) => {
            const verse = document.getElementById(`verse-${verseId}`);
            return verse
              ? [
                  [
                    verseId,
                    verse.getBoundingClientRect().top - containerRect.top,
                  ],
                ]
              : [];
          }),
        ),
      );

      const anchor = anchorVerse
        ? document.getElementById(`verse-${anchorVerse}`)
        : null;
      if (!anchor || anchor.getBoundingClientRect().top >= 16) {
        setFixedPosition(null);
        return;
      }
      setFixedPosition(containerRect.right - 48);
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    const container = gutterRef.current?.parentElement;
    if (container) resizeObserver.observe(container);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [anchorVerse, annotations]);

  if (anchorVerse) {
    return (
      <div ref={gutterRef} className={cls.gutter}>
        <div
          className={cls.controls}
          data-fixed={fixedPosition !== null || undefined}
          style={
            fixedPosition === null
              ? { top: versePositions.get(anchorVerse) }
              : { left: fixedPosition }
          }
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

  const stackCounts = new Map<VerseId, number>();
  return (
    <div ref={gutterRef} className={cls.gutter}>
      {annotations.map((annotation) => {
        const verseId = annotation.verses[0];
        const stackIndex = stackCounts.get(verseId) ?? 0;
        stackCounts.set(verseId, stackIndex + 1);
        return (
          <span
            key={annotation.id}
            className={cls.indicator}
            role="img"
            aria-label={m.annotation_indicator()}
            style={
              {
                top: versePositions.get(verseId),
                '--stack-index': stackIndex,
              } as React.CSSProperties
            }
          >
            <Icon name="chat" />
          </span>
        );
      })}
    </div>
  );
}
