import { Fragment, useMemo } from 'react'

import { defaultUSFMComponents } from './default-components'
import { parseUSFM } from './parser'
import './usfm.css'

import type {
  USFMComponents,
  USFMDocument,
  USFMMarkerNode,
  USFMNode,
} from './types'

export interface USFMRendererProps {
  usfm: string
  components?: USFMComponents
  className?: string
}

function RenderMarker({
  node,
  components,
}: {
  node: USFMMarkerNode
  components: USFMComponents
}) {
  const Component =
    components[node.marker] ??
    components[node.category] ??
    components.unknown ??
    Fragment

  const children = node.children.map((child, index) => (
    <RenderNode
      key={`${child.type === 'marker' ? child.marker : 'text'}-${index}`}
      node={child}
      components={components}
    />
  ))

  if (Component === Fragment) return <>{children}</>

  return (
    <Component
      node={node}
      marker={node.marker}
      category={node.category}
      argument={node.argument}
      attributes={node.attributes}
    >
      {children}
    </Component>
  )
}

function RenderNode({
  node,
  components,
}: {
  node: USFMNode
  components: USFMComponents
}) {
  if (node.type === 'text') return node.value
  return <RenderMarker node={node} components={components} />
}

function RenderDocument({
  document,
  components,
}: {
  document: USFMDocument
  components: USFMComponents
}) {
  const Component = components.document
  const children = document.children.map((node, index) => (
    <RenderNode
      key={`${node.type === 'marker' ? node.marker : 'text'}-${index}`}
      node={node}
      components={components}
    />
  ))

  if (!Component) return <>{children}</>
  return <Component document={document}>{children}</Component>
}

/**
 * Renders a USFM book or chapter. Components can be supplied by marker name
 * (such as `v` or `w`) or by category (such as `verse` or `word`).
 */
export function USFMRenderer({
  usfm,
  components: componentOverrides,
  className,
}: USFMRendererProps) {
  const document = useMemo(() => parseUSFM(usfm), [usfm])
  const components = {
    ...defaultUSFMComponents,
    ...componentOverrides,
  }

  return (
    <div className={className}>
      <RenderDocument document={document} components={components} />
    </div>
  )
}
