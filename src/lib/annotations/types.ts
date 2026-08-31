import type { VerseId } from '#/lib/bible/verse';

export const annotationColors = [
  'lemon',
  'leek',
  'tomato',
  'blueberry',
] as const;

export type AnnotationColor = (typeof annotationColors)[number];
export type AnnotationSyncStatus = 'pending' | 'synced';

export interface LocalAnnotation {
  id: string;
  verses: VerseId[];
  comment?: string;
  color?: AnnotationColor;
  createdAt: string;
  ownerDid: string | null;
  ownerKey: string;
  uri: string | null;
  cid: string | null;
  syncStatus: AnnotationSyncStatus;
  syncError: string | null;
}

export interface CreateAnnotationInput {
  verses: readonly VerseId[];
  comment?: string;
  color?: AnnotationColor;
  createdAt?: string;
}

export interface RemoteAnnotation {
  rkey: string;
  uri: string;
  cid: string | null;
  verses: readonly VerseId[];
  comment?: string;
  color?: AnnotationColor;
  createdAt: string;
}
