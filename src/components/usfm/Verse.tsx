import { eq, useLiveQuery } from '@tanstack/react-db';

import { formatVerseAnchorName, formatVerseId } from '#/lib/bible/verse';
import { highlightCollectionOptions } from '#/lib/highlights/collections';
import {
  useIsSelectedVerse,
  useToggleVerseSelected,
  useVerseIncludedInOpenAnnotation,
} from '../annotations/annotationPaneStore';
import { useBookId, useChapterNumber, VerseIdProvider } from './contexts';
import type { USFMNodeComponentProps } from './types';

export function Verse({ argument, children }: USFMNodeComponentProps) {
  const bookId = useBookId();
  const chapterNumber = useChapterNumber();
  const verseNumber = argument ? Number(argument) : 0;
  const verseId = formatVerseId(bookId, chapterNumber, verseNumber);
  const selected = useIsSelectedVerse(verseId);
  const includedInOpenAnnotation = useVerseIncludedInOpenAnnotation(verseId);
  const { data: appliedHighlight } = useLiveQuery({
    query: (query) =>
      query
        .from({ highlight: highlightCollectionOptions })
        .where(({ highlight }) => eq(highlight.verseId, verseId))
        .select(({ highlight }) => ({ color: highlight.color }))
        .findOne(),
  });
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
        className={`usfm-verse${highlightColor ? ` @mode-${highlightColor}` : ''}`}
        id={argument ? `verse-${verseId}` : undefined}
        data-verse-id={verseId}
        data-selected={selected || undefined}
        data-annotated={includedInOpenAnnotation || undefined}
        data-highlighted={highlightColor || undefined}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        style={{ anchorName: formatVerseAnchorName(verseId) }}
      >
        {verseNumber && (
          <sup className="usfm-verse-number @mode-denser">{verseNumber}</sup>
        )}
        {children}
      </span>
    </VerseIdProvider>
  );
}
