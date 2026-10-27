import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadUSFM } from './download-usfm.mjs';

const extra = {
  book_names: { exo: { normal: 'Exodus' }, gen: { normal: 'Genesis' } },
  chapter_headings: {
    exo: ['', 'Egypt'],
    gen: ['', 'Creation', 'Garden'],
  },
  sections: { gen: [] },
  wj_markup: false,
};
const genesis = '\\id GEN\n\\c 1\n\\v 1 Beginning\n\\c 2\n\\v 1 Garden\n';
const exodus = '\uFEFF\\id EXO\n\\c 1\n\\v 1 Egypt\n';
let output;
let fetchMock;

beforeEach(async () => {
  output = await mkdtemp(join(tmpdir(), 'margins-download-usfm-'));
  fetchMock = vi.fn((url) => {
    if (url.endsWith('extra.json')) return Response.json(extra);
    if (url.endsWith('gen.usfm')) return new Response(genesis);
    if (url.endsWith('exo.usfm')) return new Response(exodus);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(output, { recursive: true, force: true });
});

it('downloads every book unchanged and preserves Fetch Bible metadata without a manifest', async () => {
  expect(await downloadUSFM('eng_asv', { output })).toEqual(extra);
  const directory = join(output, 'eng_asv');
  expect((await readdir(directory)).sort()).toEqual([
    'exo.usfm',
    'extra.json',
    'gen.usfm',
  ]);
  expect(await readFile(join(directory, 'gen.usfm'), 'utf8')).toBe(genesis);
  expect(await readFile(join(directory, 'exo.usfm'), 'utf8')).toBe(exodus);
  expect(
    JSON.parse(await readFile(join(directory, 'extra.json'), 'utf8')),
  ).toEqual(extra);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://v1.fetch.bible/bibles/eng_asv/extra.json',
    'https://v1.fetch.bible/bibles/eng_asv/usfm/gen.usfm',
    'https://v1.fetch.bible/bibles/eng_asv/usfm/exo.usfm',
  ]);
});

it('does not publish metadata when a book download fails', async () => {
  fetchMock.mockImplementation((url) => {
    if (url.endsWith('extra.json')) return Response.json(extra);
    if (url.endsWith('gen.usfm')) return new Response(genesis);
    return new Response('Not found', { status: 404 });
  });

  await expect(downloadUSFM('eng_asv', { output })).rejects.toThrow(
    'Download failed (404): https://v1.fetch.bible/bibles/eng_asv/usfm/exo.usfm',
  );
  expect(await readdir(join(output, 'eng_asv'))).toEqual(['gen.usfm']);
});

it('rejects a response that is not the expected USFM book', async () => {
  fetchMock.mockImplementation((url) =>
    url.endsWith('extra.json')
      ? Response.json(extra)
      : new Response('<html>Unavailable</html>'),
  );

  await expect(downloadUSFM('eng_asv', { output })).rejects.toThrow(
    'Invalid USFM book ID',
  );
  expect(await readdir(join(output, 'eng_asv'))).toEqual([]);
});

it.each([
  {},
  { book_names: {} },
  { book_names: { gen: { normal: 'Genesis' } } },
  {
    book_names: { '../gen': { normal: 'Genesis' } },
    chapter_headings: { '../gen': ['', 'Creation'] },
  },
  {
    book_names: { gen: { normal: 'Genesis' } },
    chapter_headings: { gen: ['', null] },
  },
])(
  'rejects malformed or unsafe metadata before writing books: %j',
  async (value) => {
    fetchMock.mockReturnValue(Response.json(value));

    await expect(downloadUSFM('eng_asv', { output })).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  },
);

it('rejects unsafe translation keys before fetching', async () => {
  await expect(downloadUSFM('../escape', { output })).rejects.toThrow(
    'translation key',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
