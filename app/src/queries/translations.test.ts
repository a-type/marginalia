import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type * as BibleSource from '../lib/bible/source';
import {
  readerBookSourceQueryOptions,
  readerManifestQueryOptions,
} from './translations';

const { fetchManifest, fetchSource } = vi.hoisted(() => ({
  fetchManifest: vi.fn(),
  fetchSource: vi.fn(),
}));

vi.mock('../lib/bible/source', async (importOriginal) => ({
  ...(await importOriginal<typeof BibleSource>()),
  fetchTranslationManifest: fetchManifest,
  fetchTranslationSource: fetchSource,
}));

describe('reader source queries', () => {
  it('reuses loaded manifest and book data until invalidated', async () => {
    const client = new QueryClient();
    const book = { id: 'GEN', title: 'Genesis', chapters: 1 };
    const manifest = { id: 'eng_test', title: 'Test', books: [book] };
    fetchManifest.mockResolvedValue(manifest);
    fetchSource.mockResolvedValue('source');
    const manifestOptions = readerManifestQueryOptions('eng_test');
    const sourceOptions = readerBookSourceQueryOptions('eng_test', book);

    try {
      expect(await client.fetchQuery(manifestOptions)).toEqual(manifest);
      expect(await client.fetchQuery(sourceOptions)).toBe('source');
      await client.fetchQuery(manifestOptions);
      await client.fetchQuery(sourceOptions);
      expect(fetchManifest).toHaveBeenCalledTimes(1);
      expect(fetchSource).toHaveBeenCalledTimes(1);

      await client.invalidateQueries({
        queryKey: ['reader-manifest'],
        refetchType: 'none',
      });
      await client.invalidateQueries({
        queryKey: ['reader-book-source'],
        refetchType: 'none',
      });
      await client.fetchQuery(manifestOptions);
      await client.fetchQuery(sourceOptions);
      expect(fetchManifest).toHaveBeenCalledTimes(2);
      expect(fetchSource).toHaveBeenCalledTimes(2);
    } finally {
      client.clear();
      vi.clearAllMocks();
    }
  });
});
