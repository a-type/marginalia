import { afterEach, expect, it } from 'vitest';
import { defaultTranslationId } from './manifests';
import { corpusVersion } from './search';
import {
  beginTranslation,
  cancelTranslation,
  defaultDownloadSuppressed,
  deleteTranslation,
  getStoredBook,
  getTranslation,
  saveBook,
  savePreparedBook,
  translationEpoch,
  updateTranslation,
} from './translations';

afterEach(async () => {
  await deleteTranslation(defaultTranslationId, false);
});
const manifest = {
  id: defaultTranslationId,
  title: 'Test',
  books: [{ id: 'GEN', title: 'Genesis', chapters: 1, source: 'GEN.usfm' }],
};

it('does not recreate a deleted translation when its manifest arrives late', async () => {
  const epoch = await translationEpoch(defaultTranslationId);
  await deleteTranslation(defaultTranslationId);
  await expect(
    beginTranslation(manifest, 'remote', 'late-request', true, epoch),
  ).rejects.toThrow('canceled');
  expect(await getTranslation(defaultTranslationId)).toBeUndefined();
  expect(await defaultDownloadSuppressed()).toBe(true);
});

it('persists source independently of search readiness and prevents late writes after deletion', async () => {
  const record = (await beginTranslation(
    manifest,
    'remote',
    'test-owner',
    true,
  ))!;
  await saveBook(record, 'GEN', '\\c 1\n\\v 1 Text');
  await updateTranslation(record, { sourceStatus: 'ready' });
  expect((await getTranslation(defaultTranslationId))?.searchStatus).toBe(
    'queued',
  );
  expect((await getStoredBook(defaultTranslationId, 'GEN'))?.source).toContain(
    'Text',
  );
  await deleteTranslation(defaultTranslationId);
  await expect(saveBook(record, 'GEN', 'Late')).rejects.toThrow('canceled');
  expect(await getStoredBook(defaultTranslationId, 'GEN')).toBeUndefined();
  expect(await defaultDownloadSuppressed()).toBe(true);
  expect(
    await beginTranslation(manifest, 'remote', 'automatic'),
  ).toBeUndefined();
  await beginTranslation(manifest, 'remote', 'manual', true);
  expect(await defaultDownloadSuppressed()).toBe(false);
});

it('serializes ownership, resumes stored books and cancels stale preparation', async () => {
  const record = (await beginTranslation(manifest, 'remote', 'first', true))!;
  expect(
    await beginTranslation(manifest, 'remote', 'second', true),
  ).toBeUndefined();
  await saveBook(record, 'GEN', 'Source');
  await cancelTranslation(defaultTranslationId);
  await expect(savePreparedBook(record, 'GEN', [])).rejects.toThrow('canceled');
  const resumed = (await beginTranslation(manifest, 'remote', 'second', true))!;
  expect(resumed.downloaded).toBe(1);
  await savePreparedBook(resumed, 'GEN', [
    { id: 'GEN/1:1', label: '1', text: 'Text' },
  ]);
  await updateTranslation(resumed, { searchStatus: 'ready', corpusVersion });
  expect((await getTranslation(defaultTranslationId))?.prepared).toBe(1);
});

it('preserves remote attribution and license conditions independently of the catalog', async () => {
  const metadata = {
    language: 'eng',
    languageName: 'English',
    direction: 'ltr' as const,
    attribution: 'Bible publisher',
    attributionUrl: 'https://example.com/publisher',
    licenses: [
      {
        name: 'CC BY-SA',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attributionRequired: true,
        shareAlike: true,
        noDerivatives: false,
      },
    ],
  };
  const record = (await beginTranslation(
    { ...manifest, metadata },
    'remote',
    'metadata-owner',
    true,
  ))!;
  await saveBook(record, 'GEN', '\\c 1\n\\v 1 Text');
  await updateTranslation(record, { sourceStatus: 'ready', owner: undefined });
  expect(
    (await getTranslation(defaultTranslationId))?.manifest.metadata,
  ).toEqual(metadata);
  metadata.attribution = 'Changed in memory';
  expect(
    (await getTranslation(defaultTranslationId))?.manifest.metadata
      ?.attribution,
  ).toBe('Bible publisher');
});
