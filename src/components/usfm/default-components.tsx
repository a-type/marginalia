import type {
  USFMComponents,
  USFMDocumentComponentProps,
  USFMNodeComponentProps,
} from './types'

function Document({ children }: USFMDocumentComponentProps) {
  return <article className="usfm">{children}</article>
}

function Metadata({ node, children }: USFMNodeComponentProps) {
  return (
    <span hidden data-usfm-marker={node.marker}>
      {children}
    </span>
  )
}

function Title({ marker, children }: USFMNodeComponentProps) {
  const level = Number(/\d+$/.exec(marker)?.[0] ?? 1)
  if (level <= 1) return <h1 className="usfm-title">{children}</h1>
  return <h2 className="usfm-title usfm-title-secondary">{children}</h2>
}

function Heading({ marker, children }: USFMNodeComponentProps) {
  return (
    <h3 className="usfm-heading" data-usfm-marker={marker}>
      {children}
    </h3>
  )
}

function Chapter({ argument, children }: USFMNodeComponentProps) {
  return (
    <section className="usfm-chapter" data-chapter={argument}>
      {argument && <h2 className="usfm-chapter-number">Chapter {argument}</h2>}
      {children}
    </section>
  )
}

function Verse({ argument, children }: USFMNodeComponentProps) {
  return (
    <span
      className="usfm-verse"
      id={argument ? `verse-${argument}` : undefined}
    >
      {argument && <sup className="usfm-verse-number">{argument}</sup>}
      {children}
    </span>
  )
}

function Paragraph({ marker, children }: USFMNodeComponentProps) {
  return (
    <p className="usfm-paragraph" data-usfm-marker={marker}>
      {children}
    </p>
  )
}

function Poetry({ marker, children }: USFMNodeComponentProps) {
  const level = Number(/\d+$/.exec(marker)?.[0] ?? 1)
  return (
    <div
      className="usfm-poetry"
      data-usfm-marker={marker}
      style={{ '--usfm-indent': Math.max(0, level - 1) } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

function List({ marker, children }: USFMNodeComponentProps) {
  return (
    <div className="usfm-list-item" data-usfm-marker={marker}>
      {children}
    </div>
  )
}

function Table({ marker, children }: USFMNodeComponentProps) {
  return (
    <div className="usfm-table-row" role="row" data-usfm-marker={marker}>
      {children}
    </div>
  )
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
  )
}

function Word({ attributes, children }: USFMNodeComponentProps) {
  return (
    <span className="usfm-word" {...dataAttributes(attributes)}>
      {children}
    </span>
  )
}

function Note({ marker, children }: USFMNodeComponentProps) {
  const label = marker.startsWith('x') ? 'Cross reference' : 'Footnote'
  return (
    <span className="usfm-note">
      <sup className="usfm-note-marker" aria-label={label} tabIndex={0}>
        {marker.startsWith('x') ? 'x' : '†'}
      </sup>
      <span className="usfm-note-content" role="note">
        {children}
      </span>
    </span>
  )
}

function NotePart({ marker, children }: USFMNodeComponentProps) {
  return (
    <span className={`usfm-note-${marker}`} data-usfm-marker={marker}>
      {children}
    </span>
  )
}

function Milestone({ marker, attributes, children }: USFMNodeComponentProps) {
  return (
    <span data-usfm-marker={marker} {...dataAttributes(attributes)}>
      {children}
    </span>
  )
}

function Figure({ attributes, children }: USFMNodeComponentProps) {
  const source = attributes.src
  return source ? (
    <figure className="usfm-figure">
      <img src={source} alt={attributes.alt || ''} />
      {children && <figcaption>{children}</figcaption>}
    </figure>
  ) : (
    <span className="usfm-figure-placeholder">{children}</span>
  )
}

function Break({ marker }: USFMNodeComponentProps) {
  return marker === 'pb' ? <hr className="usfm-page-break" /> : <br />
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
  )
}

function dataAttributes(
  attributes: Record<string, string>,
): Record<`data-${string}`, string> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      `data-${key.replace(/[^a-zA-Z0-9_.:-]/g, '-')}`,
      value,
    ]),
  )
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
} satisfies USFMComponents
