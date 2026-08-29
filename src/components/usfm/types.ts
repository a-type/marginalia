import type { ComponentType, ReactNode } from 'react'

export type USFMNodeCategory =
  | 'book'
  | 'metadata'
  | 'title'
  | 'heading'
  | 'chapter'
  | 'verse'
  | 'paragraph'
  | 'poetry'
  | 'list'
  | 'table'
  | 'character'
  | 'word'
  | 'note'
  | 'note-part'
  | 'milestone'
  | 'figure'
  | 'break'
  | 'unknown'

export interface USFMTextNode {
  type: 'text'
  value: string
}

export interface USFMMarkerNode {
  type: 'marker'
  marker: string
  category: USFMNodeCategory
  argument?: string
  attributes: Record<string, string>
  children: USFMNode[]
  closed: boolean
}

export type USFMNode = USFMTextNode | USFMMarkerNode

export interface USFMDocument {
  type: 'document'
  children: USFMNode[]
}

export interface USFMNodeComponentProps {
  node: USFMMarkerNode
  marker: string
  category: USFMNodeCategory
  argument?: string
  attributes: Record<string, string>
  children: ReactNode
}

export interface USFMDocumentComponentProps {
  document: USFMDocument
  children: ReactNode
}

export type USFMNodeComponent = ComponentType<USFMNodeComponentProps>

export type USFMComponents = Partial<
  Record<USFMNodeCategory | string, USFMNodeComponent>
> & {
  document?: ComponentType<USFMDocumentComponentProps>
}
