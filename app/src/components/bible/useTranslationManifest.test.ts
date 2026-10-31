import { QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchBibleManifest } from '../../lib/bible/fetch-bible';
import type { TranslationManifest } from '../../lib/bible/manifests';
import { getInitialTranslationBook } from '../../lib/bible/manifests';
import type { StoredTranslation } from '../../lib/bible/translations';
import { getTranslation } from '../../lib/bible/translations';
import { translationManifestQueryOptions } from './useTranslationManifest';

vi.mock('#/lib/bible/translations', () => ({
  getTranslation: vi.fn(),
}));
vi.mock('#/lib/bible/fetch-bible', () => ({
  fetchBibleManifest: vi.fn(),
}));

const manifest: TranslationManifest = {
  id: 'fra_test',
  title: 'French Bible',
  books: [{ id: 'JHN', title: 'Jean', chapters: 21, source: 'jhn.usfm' }],
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
  vi.resetAllMocks();
});

it('uses a stored manifest without requesting the remote API, even offline', async () => {
  const stored: StoredTranslation = {
    id: manifest.id,
    manifest,
    language: 'fra',
    origin: 'remote',
    generation: 'test',
    sourceStatus: 'downloading',
    searchStatus: 'queued',
    sourceBytes: 0,
    preparedBytes: 0,
    downloaded: 0,
    prepared: 0,
    corpusVersion: 1,
  };
  vi.mocked(getTranslation).mockResolvedValue(stored);
  onlineManager.setOnline(false);

  const result = await client.fetchQuery(
    translationManifestQueryOptions(manifest.id),
  );

  expect(result).toEqual(manifest);
  expect(getTranslation).toHaveBeenCalledWith(manifest.id);
  expect(fetchBibleManifest).not.toHaveBeenCalled();
});

it('loads a remote-only manifest and resolves its initial book', async () => {
  vi.mocked(getTranslation).mockResolvedValue(undefined);
  vi.mocked(fetchBibleManifest).mockResolvedValue(manifest);

  const result = await client.fetchQuery(
    translationManifestQueryOptions(manifest.id),
  );

  expect(fetchBibleManifest).toHaveBeenCalledWith(manifest.id);
  expect(result.id).toBe(manifest.id);
  expect(getInitialTranslationBook(result)?.id).toBe('JHN');
});

it('surfaces remote manifest errors', async () => {
  vi.mocked(getTranslation).mockResolvedValue(undefined);
  const error = new Error('Unable to load translation metadata');
  vi.mocked(fetchBibleManifest).mockRejectedValue(error);

  await expect(
    client.fetchQuery(translationManifestQueryOptions(manifest.id)),
  ).rejects.toBe(error);
});
