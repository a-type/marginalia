import type { VerseId } from '#/lib/bible/verse';

export const annotationColors = [
  'lemon',
  'leek',
  'tomato',
  'blueberry',
] as const;

export type AnnotationColor = (typeof annotationColors)[number];

export interface CreateAnnotationInput {
  verses: readonly VerseId[];
  comment?: string;
  color?: AnnotationColor;
  createdAt?: string;
}
