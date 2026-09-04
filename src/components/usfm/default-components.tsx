import { formatVerseAnchorName, formatVerseId } from '#/lib/bible/verse';
import { Divider, Popover, Heading as UIHeading } from '@a-type/ui';
import {
  ChapterNumberProvider,
  useBookId,
  useChapterNumber,
  useOptionalVerseInteraction,
  useOptionalVersePresentation,
  VerseIdProvider,
} from './contexts';
import type {
  USFMComponents,
  USFMDocumentComponentProps,
  USFMNodeComponentProps,
} from './types';

function Document({ children }: USFMDocumentComponentProps) {
  const presentation = useOptionalVersePresentation();
  return (
    <article
      className="usfm"
      data-viewing-annotation={presentation?.active || undefined}
    >
      {children}
    </article>
  );
}

function Metadata({ node, children }: USFMNodeComponentProps) {
  return (
    <span hidden data-usfm-marker={node.marker}>
      {children}
    </span>
  );
}

function Title({ marker, children }: USFMNodeComponentProps) {
  const level = Number(/\d+$/.exec(marker)?.[0] ?? 1);
  if (level <= 1)
    return (
      <UIHeading render={<h1 />} emphasis="primary" className="usfm-title">
        {children}
      </UIHeading>
    );
  return (
    <UIHeading
      render={<h2 />}
      emphasis="secondary"
      className="usfm-title usfm-title-secondary"
    >
      {children}
    </UIHeading>
  );
}

function Heading({ marker, children }: USFMNodeComponentProps) {
  return (
    <UIHeading
      render={<h3 />}
      emphasis="ambient"
      className="usfm-heading"
      data-usfm-marker={marker}
    >
      {children}
    </UIHeading>
  );
}

function Chapter({ argument, children }: USFMNodeComponentProps) {
  return (
    <ChapterNumberProvider chapterNumber={argument ? Number(argument) : 0}>
      <section className="usfm-chapter" data-chapter={argument}>
        {argument && (
          <UIHeading
            render={<h2 />}
            emphasis="ambient"
            className="usfm-chapter-number"
          >
            Chapter {argument}
          </UIHeading>
        )}
        {children}
      </section>
    </ChapterNumberProvider>
  );
}

function Verse({ argument, children }: USFMNodeComponentProps) {
  const bookId = useBookId();
  const chapterNumber = useChapterNumber();
  const verseNumber = argument ? Number(argument) : 0;
  const verseId = formatVerseId(bookId, chapterNumber, verseNumber);
  const interaction = useOptionalVerseInteraction();
  const presentation = useOptionalVersePresentation();
  const selected = interaction?.isSelected(verseId) ?? false;
  const annotated = presentation?.isAnnotated(verseId) ?? false;
  const highlightColor = presentation?.getHighlightColor(verseId);

  const handleClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    const target = event.target;
    const interactiveTarget =
      target instanceof Element
        ? target.closest('button, a, input, textarea, select, [role="button"]')
        : null;
    if (interactiveTarget && interactiveTarget !== event.currentTarget) {
      return;
    }
    interaction?.toggle(verseId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    interaction?.toggle(verseId);
  };

  return (
    <VerseIdProvider verseId={verseId}>
      <span
        className={`usfm-verse${highlightColor ? ` @mode-${highlightColor}` : ''}`}
        id={argument ? `verse-${verseId}` : undefined}
        data-verse-id={verseId}
        data-selected={selected || undefined}
        data-annotated={annotated || undefined}
        data-highlighted={highlightColor || undefined}
        role={interaction ? 'button' : undefined}
        tabIndex={interaction ? 0 : undefined}
        aria-pressed={interaction ? selected : undefined}
        onClick={interaction ? handleClick : undefined}
        onKeyDown={interaction ? handleKeyDown : undefined}
        style={{
          anchorName: formatVerseAnchorName(verseId),
        }}
      >
        {verseNumber && (
          <sup className="usfm-verse-number @mode-denser">{verseNumber}</sup>
        )}
        {children}
      </span>
    </VerseIdProvider>
  );
}

function Paragraph({ marker, children }: USFMNodeComponentProps) {
  return (
    <p className="usfm-paragraph" data-usfm-marker={marker}>
      {children}
    </p>
  );
}

function Poetry({ marker, children }: USFMNodeComponentProps) {
  const level = Number(/\d+$/.exec(marker)?.[0] ?? 1);
  return (
    <div
      className="usfm-poetry"
      data-usfm-marker={marker}
      style={{ '--usfm-indent': Math.max(0, level - 1) } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function List({ marker, children }: USFMNodeComponentProps) {
  return (
    <div className="usfm-list-item" data-usfm-marker={marker}>
      {children}
    </div>
  );
}

function Table({ marker, children }: USFMNodeComponentProps) {
  return (
    <div className="usfm-table-row" role="row" data-usfm-marker={marker}>
      {children}
    </div>
  );
}

function Character({ marker, attributes, children }: USFMNodeComponentProps) {
  return (
    <span
      className={`usfm-character usfm-${marker}`}
      data-usfm-marker={marker}
      {...dataAttributes(attributes)}
    >
      {children}
    </span>
  );
}

function Word({ attributes, children }: USFMNodeComponentProps) {
  return (
    <span className="usfm-word" {...dataAttributes(attributes)}>
      {children}
    </span>
  );
}

function Note({ marker, children }: USFMNodeComponentProps) {
  const label = marker.startsWith('x') ? 'Cross reference' : 'Footnote';

  return (
    <span className="usfm-note">
      <Popover>
        <Popover.Trigger
          openOnHover
          nativeButton={false}
          render={<sup />}
          className="usfm-note-marker"
          aria-label={label}
          tabIndex={0}
          role="button"
        >
          {marker.startsWith('x') ? 'x' : '†'}
        </Popover.Trigger>
        <Popover.Content
          side="top"
          className="usfm-note-content @mode-dense"
          role="note"
        >
          <Popover.Arrow />
          {children}
        </Popover.Content>
      </Popover>
    </span>
  );
}

function NotePart({ marker, children }: USFMNodeComponentProps) {
  return (
    <span className={`usfm-note-${marker}`} data-usfm-marker={marker}>
      {children}
    </span>
  );
}

function Milestone({ marker, attributes, children }: USFMNodeComponentProps) {
  return (
    <span data-usfm-marker={marker} {...dataAttributes(attributes)}>
      {children}
    </span>
  );
}

function Figure({ attributes, children }: USFMNodeComponentProps) {
  const source = attributes.src;
  return source ? (
    <figure className="usfm-figure">
      <img src={source} alt={attributes.alt || ''} />
      {children && <figcaption>{children}</figcaption>}
    </figure>
  ) : (
    <span className="usfm-figure-placeholder">{children}</span>
  );
}

function Break({ marker }: USFMNodeComponentProps) {
  return marker === 'pb' ? <Divider className="usfm-page-break" /> : <br />;
}

function Unknown({ marker, attributes, children }: USFMNodeComponentProps) {
  return (
    <span
      className="usfm-unknown"
      data-usfm-marker={marker}
      {...dataAttributes(attributes)}
    >
      {children}
    </span>
  );
}

function dataAttributes(
  attributes: Record<string, string>,
): Record<`data-${string}`, string> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      `data-${key.replace(/[^a-zA-Z0-9_.:-]/g, '-')}`,
      value,
    ]),
  );
}

export const defaultUSFMComponents = {
  document: Document,
  book: Metadata,
  metadata: Metadata,
  title: Title,
  heading: Heading,
  chapter: Chapter,
  verse: Verse,
  paragraph: Paragraph,
  poetry: Poetry,
  list: List,
  table: Table,
  character: Character,
  word: Word,
  note: Note,
  'note-part': NotePart,
  milestone: Milestone,
  figure: Figure,
  break: Break,
  unknown: Unknown,
} satisfies USFMComponents;
