import type { DbClient } from '@tanstack/react-db';
import {
  BasicIndex,
  collectionOptions,
  localStorageCollectionOptions,
} from '@tanstack/react-db';

import type { BookId, VerseId } from '#/lib/bible/verse';
import type { HighlightColor } from './types';

export type HighlightStatus = 'pending' | 'uploaded' | 'synced';

export interface HighlightRecord {
  id: string;
  rkey: string;
  uri: string | null;
  cid: string | null;
  authorDid: string | null;
  verseId: VerseId;
  bookId: BookId;
  chapter: number;
  verse: number;
  color: HighlightColor;
  createdAt: string;
  status: HighlightStatus;
  syncError: string | null;
}

export interface ChapterHighlightSnapshot {
  highlights: HighlightRecord[];
}

export const highlightCollectionOptions = collectionOptions(
  localStorageCollectionOptions<HighlightRecord>({
    id: 'highlights-v1',
    storageKey: 'apostil.highlights.v1',
    getKey: (highlight) => highlight.id,
    defaultIndexType: BasicIndex,
    autoIndex: 'eager',
  }),
);

export function getHighlightCollections(dbClient: DbClient) {
  return { highlights: dbClient.collection(highlightCollectionOptions) };
}

export function formatHighlightRkey(verseId: VerseId) {
  return `highlight-${verseId.toLowerCase().replace('/', '-').replace(':', '-')}`;
}
