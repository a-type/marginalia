import { afterEach, expect, it } from 'vitest';
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
  await deleteTranslation('web-p', false);
});
const manifest = {
  id: 'web-p',
  title: 'Test',
  books: [{ id: 'GEN', title: 'Genesis', chapters: 1, source: 'GEN.usfm' }],
};

it('does not recreate a deleted translation when its manifest arrives late', async () => {
  const epoch = await translationEpoch('web-p');
  await deleteTranslation('web-p');
  await expect(
    beginTranslation(manifest, 'remote', 'late-request', true, epoch),
  ).rejects.toThrow('canceled');
  expect(await getTranslation('web-p')).toBeUndefined();
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
  expect((await getTranslation('web-p'))?.searchStatus).toBe('queued');
  expect((await getStoredBook('web-p', 'GEN'))?.source).toContain('Text');
  await deleteTranslation('web-p');
  await expect(saveBook(record, 'GEN', 'Late')).rejects.toThrow('canceled');
  expect(await getStoredBook('web-p', 'GEN')).toBeUndefined();
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
  await cancelTranslation('web-p');
  await expect(savePreparedBook(record, 'GEN', [])).rejects.toThrow('canceled');
  const resumed = (await beginTranslation(manifest, 'remote', 'second', true))!;
  expect(resumed.downloaded).toBe(1);
  await savePreparedBook(resumed, 'GEN', [
    { id: 'GEN/1:1', label: '1', text: 'Text' },
  ]);
  await updateTranslation(resumed, { searchStatus: 'ready', corpusVersion });
  expect((await getTranslation('web-p'))?.prepared).toBe(1);
});
