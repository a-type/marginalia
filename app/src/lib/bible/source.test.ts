import { afterEach, expect, it, vi } from 'vitest';
import { fetchTranslationManifest } from './source';
import { getTranslation } from './translations';

vi.mock('./translations', () => ({
  getStoredBook: vi.fn(),
  getTranslation: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads built-in translation metadata from the bundled static files', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example' } });
  vi.mocked(getTranslation).mockResolvedValue(undefined);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      book_names: { gen: { normal: 'Genesis' } },
      chapter_headings: { gen: ['', 'Creation'] },
    }),
  );

  await expect(fetchTranslationManifest('eng_webc')).resolves.toMatchObject({
    id: 'eng_webc',
    title: 'World English Bible (Catholic Edition)',
    books: [{ id: 'GEN', source: 'gen.usfm' }],
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://app.example/usfm/eng-webc/extra.json',
  );
});
