import { expect, it } from 'vitest';
import { builtinTranslations } from './manifests';
import type {
  SearchResult,
  WorkerRequest,
  WorkerResponse,
} from './translation-jobs';
import {
  deleteTranslation,
  getStoredBook,
  getTranslation,
  translationDatabase,
} from './translations';
import { formatVerseId } from './verse';

it.each(builtinTranslations)(
  'downloads and prepares $id from bundled metadata',
  async ({ id, title }) => {
    await deleteTranslation(id, false);
    const worker = new Worker(
      new URL('./translation.worker.ts', import.meta.url),
      { type: 'module' },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (data.requestId !== 1) return;
          if (data.error) reject(new Error(data.error));
          else resolve();
        };
        worker.onerror = reject;
        worker.postMessage({
          action: 'install',
          translationId: id,
          explicit: true,
          requestId: 1,
        } satisfies WorkerRequest);
      });
      const record = await getTranslation(id);
      expect(record?.manifest).toMatchObject({ id, title });
      expect(record?.sourceStatus).toBe('ready');
      expect(record?.searchStatus).toBe('ready');
      expect(record?.downloaded).toBe(record?.manifest.books.length);
      expect(record?.prepared).toBe(record?.manifest.books.length);
      expect((await getStoredBook(id, 'GEN'))?.source).toContain('\\id GEN');
    } finally {
      worker.terminate();
      await deleteTranslation(id, false);
    }
  },
  60_000,
);

it('imports, prepares and searches persisted verses in a fresh worker without raw source', async () => {
  let worker = new Worker(new URL('./translation.worker.ts', import.meta.url), {
    type: 'module',
  });
  let nextRequest = 0;
  const request = <TResult>(
    command:
      | Omit<Extract<WorkerRequest, { action: 'import' }>, 'requestId'>
      | Omit<Extract<WorkerRequest, { action: 'search' }>, 'requestId'>,
  ) =>
    new Promise<TResult>((resolve, reject) => {
      const requestId = ++nextRequest;
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.requestId !== requestId) return;
        if (data.error) reject(new Error(data.error));
        else resolve(data.result as TResult);
      };
      worker.onerror = reject;
      worker.postMessage({ ...command, requestId });
    });
  const translationId = `local-${crypto.randomUUID()}`;
  try {
    await request({
      action: 'import',
      translationId,
      title: 'Partial edition',
      file: new File(
        [
          '\\id GEN\n\\c 1\n\\v 1 The light shines.\n\\v 2 Truly, truly.\n' +
            Array.from({ length: 58 }, (_, i) => `\\v ${i + 3} Extra.\n`).join(
              '',
            ) +
            '\\id REV\n\\c 1\n\\v 1 The light remains.',
        ],
        'Bible.usfm',
      ),
    });
    expect((await getTranslation(translationId))?.searchStatus).toBe('ready');
    const db = await translationDatabase();
    await db.delete('books', [translationId, 'GEN']);
    await db.delete('books', [translationId, 'REV']);
    worker.terminate();
    worker = new Worker(new URL('./translation.worker.ts', import.meta.url), {
      type: 'module',
    });
    const results = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '"the light"',
      page: 0,
    });
    expect(results.verses.map((verse) => verse.id)).toEqual([
      'GEN/1:1',
      'REV/1:1',
    ]);
    const genesisResults = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '"the light"',
      page: 0,
      bookId: 'GEN',
    });
    expect(genesisResults.total).toBe(1);
    expect(genesisResults.verses.map((verse) => verse.id)).toEqual(['GEN/1:1']);
    const annotated = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '',
      page: 0,
      verseIds: ['REV/1:1', 'GEN/1:2', 'GEN/1:1'],
    });
    expect(annotated.verses.map((verse) => verse.id)).toEqual([
      'REV/1:1',
      'GEN/1:2',
      'GEN/1:1',
    ]);
    expect(annotated.verses.every((verse) => verse.ranges.length === 0)).toBe(
      true,
    );
    const filtered = await request<SearchResult>({
      action: 'search',
      translationId,
      query: 'light',
      page: 0,
      bookId: 'GEN',
      verseIds: ['REV/1:1', 'GEN/1:2', 'GEN/1:1'],
    });
    expect(filtered.verses.map((verse) => verse.id)).toEqual(['GEN/1:1']);
    const noAnnotations = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '',
      page: 0,
      verseIds: [],
    });
    expect(noAnnotations.total).toBe(0);
    const noFilter = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '',
      page: 0,
    });
    expect(noFilter.total).toBe(0);
    const orderedIds = Array.from({ length: 60 }, (_, i) =>
      formatVerseId('GEN', 1, 60 - i),
    );
    const secondPage = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '',
      page: 1,
      verseIds: orderedIds,
    });
    expect(secondPage.total).toBe(60);
    expect(secondPage.verses.map((verse) => verse.id)).toEqual(
      orderedIds.slice(50),
    );
    await db.delete('prepared', [translationId, 'GEN']);
    await db.delete('prepared', [translationId, 'REV']);
    const warm = await request<SearchResult>({
      action: 'search',
      translationId,
      query: '"truly truly"',
      page: 0,
    });
    expect(warm.total).toBe(1);
    await deleteTranslation(translationId);
    await expect(
      request({ action: 'search', translationId, query: 'light', page: 0 }),
    ).rejects.toThrow('not ready');
  } finally {
    worker.terminate();
    await deleteTranslation(translationId, false);
  }
});
