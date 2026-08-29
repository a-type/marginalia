import type {
  USFMDocument,
  USFMMarkerNode,
  USFMNode,
  USFMNodeCategory,
} from './types'

const METADATA_MARKERS = new Set([
  'id',
  'ide',
  'sts',
  'rem',
  'h',
  'h1',
  'h2',
  'h3',
  'toc1',
  'toc2',
  'toc3',
  'toca1',
  'toca2',
  'toca3',
])

const TITLE_MARKER = /^(?:mt|mte|imt|imte)\d*$/
const HEADING_MARKER = /^(?:s|sr|r|d|sp|sd|is|iq|iqt|iot|io|iex|imte|cl|cd)\d*$/
const PARAGRAPH_MARKER =
  /^(?:p|m|po|pr|cls|pmo|pm|pmc|pmr|pi|mi|nb|pc|ph|lit)\d*$/
const POETRY_MARKER = /^(?:q|qr|qc|qa|qm|qd)\d*$/
const LIST_MARKER = /^(?:lh|li|lf|lim)\d*$/
const TABLE_MARKER = /^(?:tr|th|thr|tc|tcr)\d*$/

const NOTE_MARKERS = new Set(['f', 'fe', 'ef', 'x', 'ex'])
const NOTE_PART_MARKERS = new Set([
  'fr',
  'ft',
  'fk',
  'fq',
  'fqa',
  'fl',
  'fw',
  'fp',
  'fv',
  'fdc',
  'fm',
  'xo',
  'xop',
  'xk',
  'xq',
  'xt',
  'xta',
  'xot',
  'xnt',
  'xdc',
])

const CHARACTER_MARKERS = new Set([
  'add',
  'bk',
  'dc',
  'em',
  'k',
  'litl',
  'nd',
  'no',
  'ord',
  'pn',
  'png',
  'qt',
  'rq',
  'sig',
  'sls',
  'tl',
  'wj',
  'bd',
  'bdit',
  'it',
  'sc',
  'sup',
  'rb',
  'pro',
  'w',
  'wa',
  'wg',
  'wh',
  'jmp',
  'ca',
  'va',
])

const PAIRED_MARKERS = new Set([...NOTE_MARKERS, ...CHARACTER_MARKERS, 'fig'])
const ATTRIBUTE_MARKERS = new Set(['w', 'wa', 'wg', 'wh', 'rb', 'jmp', 'fig'])

const ARGUMENT_MARKERS = new Set(['c', 'v'])
const BREAK_MARKERS = new Set(['b', 'pb'])

interface InlineResult {
  nodes: USFMNode[]
  position: number
  closed: boolean
}

function markerCategory(marker: string): USFMNodeCategory {
  if (marker === 'id') return 'book'
  if (METADATA_MARKERS.has(marker)) return 'metadata'
  if (TITLE_MARKER.test(marker)) return 'title'
  if (marker === 'c') return 'chapter'
  if (marker === 'v') return 'verse'
  if (HEADING_MARKER.test(marker)) return 'heading'
  if (PARAGRAPH_MARKER.test(marker)) return 'paragraph'
  if (POETRY_MARKER.test(marker)) return 'poetry'
  if (LIST_MARKER.test(marker)) return 'list'
  if (TABLE_MARKER.test(marker)) return 'table'
  if (marker === 'w') return 'word'
  if (NOTE_MARKERS.has(marker)) return 'note'
  if (NOTE_PART_MARKERS.has(marker)) return 'note-part'
  if (marker.endsWith('-s') || marker.endsWith('-e')) return 'milestone'
  if (marker === 'fig') return 'figure'
  if (BREAK_MARKERS.has(marker)) return 'break'
  if (CHARACTER_MARKERS.has(marker)) return 'character'
  return 'unknown'
}

function createMarker(
  marker: string,
  children: USFMNode[] = [],
  values: Partial<
    Pick<USFMMarkerNode, 'argument' | 'attributes' | 'closed'>
  > = {},
): USFMMarkerNode {
  return {
    type: 'marker',
    marker,
    category: markerCategory(marker),
    attributes: values.attributes ?? {},
    children,
    closed: values.closed ?? false,
    ...(values.argument === undefined ? {} : { argument: values.argument }),
  }
}

function parseAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    const key = match[1]
    if (key) {
      attributes[key] = match[2] || match[3] || match[4] || ''
    }
  }

  return attributes
}

function splitAttributes(value: string): {
  content: string
  attributes: Record<string, string>
} {
  const delimiter = value.indexOf('|')
  if (delimiter === -1) return { content: value, attributes: {} }

  return {
    content: value.slice(0, delimiter),
    attributes: parseAttributes(value.slice(delimiter + 1)),
  }
}

function findMarkerEnd(source: string, start: number): number {
  let index = start
  while (index < source.length && /[+\w-]/.test(source[index] ?? '')) index++
  return index
}

function findClosingMarker(
  source: string,
  start: number,
  marker: string,
): { contentEnd: number; nextPosition: number; closed: boolean } {
  const close = `\\${marker}*`
  const nestedOpen = `\\${marker} `
  let depth = 1
  let position = start

  while (position < source.length) {
    const nextClose = source.indexOf(close, position)
    const nextOpen = source.indexOf(nestedOpen, position)

    if (nextClose === -1) {
      return {
        contentEnd: source.length,
        nextPosition: source.length,
        closed: false,
      }
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      position = nextOpen + nestedOpen.length
      continue
    }

    depth--
    if (depth === 0) {
      return {
        contentEnd: nextClose,
        nextPosition: nextClose + close.length,
        closed: true,
      }
    }
    position = nextClose + close.length
  }

  return {
    contentEnd: source.length,
    nextPosition: source.length,
    closed: false,
  }
}

function parseNoteContents(source: string): {
  caller?: string
  nodes: USFMNode[]
} {
  const nodes: USFMNode[] = []
  let position = 0
  let caller: string | undefined

  const firstField = source.search(
    /\\[+]?(?:fr|ft|fk|fq|fqa|fl|fw|fp|fv|fdc|fm|xo|xop|xk|xq|xt|xta|xot|xnt|xdc)\b/,
  )
  if (firstField > 0) {
    caller = source.slice(0, firstField).trim() || undefined
    position = firstField
  }

  while (position < source.length) {
    if (source[position] !== '\\') {
      const next = source.indexOf('\\', position)
      const end = next === -1 ? source.length : next
      nodes.push({ type: 'text', value: source.slice(position, end) })
      position = end
      continue
    }

    const nameStart = position + 1
    const nameEnd = findMarkerEnd(source, nameStart)
    const marker = source.slice(nameStart, nameEnd).replace(/^\+/, '')
    if (!NOTE_PART_MARKERS.has(marker)) {
      const parsed = parseInline(source.slice(position))
      nodes.push(...parsed.nodes)
      break
    }

    let contentStart = nameEnd
    if (source[contentStart] === ' ') contentStart++
    const nextField = source
      .slice(contentStart)
      .search(
        /\\[+]?(?:fr|ft|fk|fq|fqa|fl|fw|fp|fv|fdc|fm|xo|xop|xk|xq|xt|xta|xot|xnt|xdc)\b/,
      )
    const contentEnd =
      nextField === -1 ? source.length : contentStart + nextField
    const content = source.slice(contentStart, contentEnd).trim()
    nodes.push(
      createMarker(marker, parseInline(content).nodes, { closed: true }),
    )
    position = contentEnd
  }

  return { caller, nodes }
}

function parseInline(source: string, stopMarker?: string): InlineResult {
  const nodes: USFMNode[] = []
  let position = 0

  while (position < source.length) {
    const markerStart = source.indexOf('\\', position)
    if (markerStart === -1) {
      nodes.push({ type: 'text', value: source.slice(position) })
      return { nodes, position: source.length, closed: false }
    }
    if (markerStart > position) {
      nodes.push({ type: 'text', value: source.slice(position, markerStart) })
    }

    if (source.startsWith('\\*', markerStart)) {
      return {
        nodes,
        position: markerStart + 2,
        closed: stopMarker === '*',
      }
    }

    const nameStart = markerStart + 1
    const nameEnd = findMarkerEnd(source, nameStart)
    if (nameEnd === nameStart) {
      nodes.push({ type: 'text', value: '\\' })
      position = nameStart
      continue
    }

    const rawMarker = source.slice(nameStart, nameEnd)
    const marker = rawMarker.replace(/^\+/, '')
    const isClosing = source[nameEnd] === '*'
    if (isClosing) {
      if (marker === stopMarker) {
        return { nodes, position: nameEnd + 1, closed: true }
      }
      nodes.push({
        type: 'text',
        value: source.slice(markerStart, nameEnd + 1),
      })
      position = nameEnd + 1
      continue
    }

    let contentStart = nameEnd
    if (source[contentStart] === ' ') contentStart++

    if (ARGUMENT_MARKERS.has(marker)) {
      const argumentMatch = /^(\S+)\s*/.exec(source.slice(contentStart))
      const argument = argumentMatch?.[1]
      const childStart = contentStart + (argumentMatch?.[0].length ?? 0)
      const children = parseInline(source.slice(childStart)).nodes
      nodes.push(createMarker(marker, children, { argument }))
      return { nodes, position: source.length, closed: false }
    }

    if (marker.endsWith('-s') || marker.endsWith('-e')) {
      const milestoneEnd = source.indexOf('\\*', contentStart)
      const end = milestoneEnd === -1 ? source.length : milestoneEnd
      const { content, attributes } = splitAttributes(
        source.slice(contentStart, end).trim(),
      )
      nodes.push(
        createMarker(marker, parseInline(content).nodes, {
          attributes,
          closed: milestoneEnd !== -1,
        }),
      )
      position = milestoneEnd === -1 ? source.length : milestoneEnd + 2
      continue
    }

    if (PAIRED_MARKERS.has(marker)) {
      const closing = findClosingMarker(source, contentStart, rawMarker)
      const rawContent = source.slice(contentStart, closing.contentEnd)
      const { content, attributes } = ATTRIBUTE_MARKERS.has(marker)
        ? splitAttributes(rawContent)
        : { content: rawContent, attributes: {} }
      const note = NOTE_MARKERS.has(marker)
        ? parseNoteContents(content)
        : undefined
      const children = note?.nodes ?? parseInline(content, rawMarker).nodes
      nodes.push(
        createMarker(marker, children, {
          argument: note?.caller,
          attributes,
          closed: closing.closed,
        }),
      )
      position = closing.nextPosition
      continue
    }

    const nextMarker = source.indexOf('\\', contentStart)
    const contentEnd = nextMarker === -1 ? source.length : nextMarker
    const { content, attributes } = splitAttributes(
      source.slice(contentStart, contentEnd),
    )
    nodes.push(
      createMarker(marker, parseInline(content).nodes, {
        attributes,
        closed: false,
      }),
    )
    position = contentEnd
  }

  return { nodes, position, closed: false }
}

function extractArgument(value: string): {
  argument?: string
  content: string
} {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(value.trim())
  if (!match) return { content: '' }
  return { argument: match[1], content: match[2] || '' }
}

function isContainerCategory(category: USFMNodeCategory): boolean {
  return (
    category === 'paragraph' ||
    category === 'poetry' ||
    category === 'list' ||
    category === 'table'
  )
}

/**
 * Parses a USFM book or chapter into a renderable tree. Unknown markers are
 * retained so consumers can supply a component without changing the parser.
 */
export function parseUSFM(usfm: string): USFMDocument {
  const document: USFMDocument = { type: 'document', children: [] }
  let chapter: USFMMarkerNode | undefined
  let container: USFMMarkerNode | undefined

  for (const rawLine of usfm.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = /^\\([+\w-]+)(?:\s+([\s\S]*))?$/.exec(line)
    if (!match?.[1]) {
      const target =
        container?.children ?? chapter?.children ?? document.children
      target.push({ type: 'text', value: line })
      continue
    }

    const marker = match[1].replace(/^\+/, '')
    const value = match[2] || ''
    const category = markerCategory(marker)

    if (marker === 'id') {
      const { argument, content } = extractArgument(value)
      document.children.push(
        createMarker(marker, parseInline(content).nodes, { argument }),
      )
      container = undefined
      continue
    }

    if (marker === 'c') {
      const { argument, content } = extractArgument(value)
      chapter = createMarker(
        marker,
        content ? parseInline(content).nodes : [],
        { argument },
      )
      document.children.push(chapter)
      container = undefined
      continue
    }

    if (marker === 'v') {
      const { argument, content } = extractArgument(value)
      const verse = createMarker(marker, parseInline(content).nodes, {
        argument,
      })
      ;(container?.children ?? chapter?.children ?? document.children).push(
        verse,
      )
      continue
    }

    const node = createMarker(marker, parseInline(value).nodes)
    const chapterTarget = chapter?.children ?? document.children

    if (isContainerCategory(category)) {
      chapterTarget.push(node)
      container = node
    } else {
      chapterTarget.push(node)
      container = undefined
    }
  }

  return document
}
