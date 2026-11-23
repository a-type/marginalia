import { useDbClient, useLiveQuery } from '@tanstack/react-db';
import { clsx } from '@a-type/ui';

import {
  formatVerseAnchorName,
  formatVerseId,
  parseVerseLabel,
} from '../../lib/bible/verse';
import { getHighlightCollections } from '../../lib/highlights/collections';
import {
  useIsSelectedVerse,
  useToggleVerseSelected,
  useVerseIncludedInOpenAnnotation,
} from '../annotations/annotationPaneStore';
import { useBookId, useChapterNumber, VerseIdProvider } from './contexts';
import { usePericopeVerseIds } from '../bible/Pericope';
import cls from './Verse.module.css';
import type { USFMNodeComponentProps } from './types';

export function Verse({
  argument,
  children,
  isContinuation = false,
}: USFMNodeComponentProps & { isContinuation?: boolean }) {
  const bookId = useBookId();
  const chapterNumber = useChapterNumber();
  const verseNumber = argument ? (parseVerseLabel(argument) ?? 0) : 0;
  const isAnchor =
    !isContinuation && Boolean(verseNumber && !/[b-z]$/.test(argument ?? ''));
  const verseId = formatVerseId(bookId, chapterNumber, verseNumber);
  const selected = useIsSelectedVerse(verseId);
  const inPericope = usePericopeVerseIds().includes(verseId);
  const includedInOpenAnnotation = useVerseIncludedInOpenAnnotation(verseId);
  const dbClient = useDbClient();
  const { data: highlights } = useLiveQuery(
    getHighlightCollections(dbClient).highlights,
  );
  const appliedHighlight = highlights?.find(
    (highlight) =>
      highlight.verseId === verseId &&
      highlight.status !== 'deleting' &&
      highlight.status !== 'deleted',
  );
  const highlightColor = appliedHighlight?.color;
  const toggle = useToggleVerseSelected(verseId);

  const handleClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    const target = event.target;
    const interactiveTarget =
      target instanceof Element
        ? target.closest('button, a, input, textarea, select, [role="button"]')
        : null;
    if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
    toggle();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  };

  return (
    <VerseIdProvider verseId={verseId}>
      <span
        className={clsx(
          'usfm-verse',
          cls.verse,
          highlightColor && `@mode-${highlightColor}`,
        )}
        id={isAnchor ? `verse-${verseId}` : undefined}
        data-verse-id={verseId}
        data-selected={selected || undefined}
        data-pericope={inPericope || undefined}
        data-annotated={includedInOpenAnnotation || undefined}
        data-highlighted={highlightColor || undefined}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        style={{
          anchorName: isAnchor ? formatVerseAnchorName(verseId) : undefined,
        }}
      >
        {!isContinuation && verseNumber && (
          <sup className="usfm-verse-number @mode-denser">{argument}</sup>
        )}
        {children}
      </span>
    </VerseIdProvider>
  );
}
