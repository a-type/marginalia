import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBibleManifest,
  filterFetchBibleTranslations,
  parseFetchBibleCatalog,
  translationResourceUrl,
} from './fetch-bible';

afterEach(() => vi.restoreAllMocks());

it.each(['', 'not-a-url', 'https://user:password@example.com'])(
  'ignores an invalid license URL without breaking the catalog: %s',
  (url) => {
    const data = catalog();
    data.translations.fra_test.copyright.licenses[0].url = url;
    expect(parseFetchBibleCatalog(data)).toEqual([]);
  },
);

const restrictions = {
  forbid_commercial: false,
  forbid_limitless: false,
  forbid_other: false,
  forbid_attributionless: true,
  forbid_derivatives: false,
};
function catalog(
  license: unknown = 'cc-by',
  url = 'https://creativecommons.org/licenses/by/4.0/',
) {
  return {
    languages: { fra: { english: 'French', local: 'francais' } },
    licenses: {
      'cc-by': { restrictions: { ...restrictions } },
      public: { restrictions: { ...restrictions } },
      'cc-by-sa': {
        restrictions: { ...restrictions, forbid_derivatives: 'same-license' },
      },
      'cc-by-nd': {
        restrictions: { ...restrictions, forbid_derivatives: true },
      },
    },
    translations: {
      fra_test: {
        name: {
          local: 'La Bible',
          english: 'French Bible',
          local_abbrev: 'LB',
          english_abbrev: 'FB',
        },
        direction: 'ltr',
        copyright: {
          attribution: 'Bible publisher',
          attribution_url: 'https://example.com/publisher',
          licenses: [{ license, url }],
        },
      },
    },
  };
}

describe('Fetch Bible commercial-use policy', () => {
  it.each(['public', 'cc-by', 'cc-by-sa', 'cc-by-nd', restrictions])(
    'accepts explicit commercial-use permission: %j',
    (license) => {
      const [translation] = parseFetchBibleCatalog(catalog(license));
      expect(translation).toMatchObject({
        id: 'fra_test',
        title: 'La Bible',
        language: 'fra',
        languageName: 'French',
        attribution: 'Bible publisher',
        attributionUrl: 'https://example.com/publisher',
      });
      expect(translation.licenses[0].url).toBe(
        'https://creativecommons.org/licenses/by/4.0/',
      );
    },
  );
  it.each([
    'cc-by-nc',
    'cc-by-nc-sa',
    'cc-by-nc-nd',
    'unknown',
    null,
    {},
    { ...restrictions, forbid_commercial: true },
    { ...restrictions, forbid_other: true },
    { ...restrictions, forbid_limitless: true },
  ])('rejects restricted or unverified terms: %j', (license) => {
    expect(parseFetchBibleCatalog(catalog(license))).toEqual([]);
  });
  it('rejects missing attribution, unsafe links, and contradictory named-license restrictions', () => {
    const missing = catalog();
    missing.translations.fra_test.copyright.attribution = '';
    expect(parseFetchBibleCatalog(missing)).toEqual([]);
    expect(
      parseFetchBibleCatalog(catalog('cc-by', 'javascript:alert(1)')),
    ).toEqual([]);
    const contradictory = catalog();
    contradictory.licenses['cc-by'].restrictions.forbid_commercial = true;
    expect(parseFetchBibleCatalog(contradictory)).toEqual([]);
  });
  it('preserves share-alike and no-derivatives conditions', () => {
    expect(
      parseFetchBibleCatalog(catalog('cc-by-sa'))[0].licenses[0].shareAlike,
    ).toBe(true);
    expect(
      parseFetchBibleCatalog(catalog('cc-by-nd'))[0].licenses[0].noDerivatives,
    ).toBe(true);
  });
  it('combines text and language filtering across local names and abbreviations', () => {
    const translations = parseFetchBibleCatalog(catalog());
    expect(
      filterFetchBibleTranslations(translations, ' FRENCH  lb ', 'fra'),
    ).toEqual(translations);
    expect(filterFetchBibleTranslations(translations, 'francais', '')).toEqual(
      translations,
    );
    expect(filterFetchBibleTranslations(translations, 'Bible', 'eng')).toEqual(
      [],
    );
    expect(filterFetchBibleTranslations(translations, 'absent', '')).toEqual(
      [],
    );
  });

  it('resolves a remote edition title and attribution before loading its books', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        String(url).endsWith('/manifest.json')
          ? Response.json(catalog())
          : Response.json({
              book_names: { gen: { normal: 'Genese' } },
              chapter_headings: { gen: ['', 'Creation'] },
            }),
      );
    const manifest = await fetchBibleManifest('fra_test');
    expect(manifest).toMatchObject({
      title: 'La Bible',
      metadata: { attribution: 'Bible publisher', language: 'fra' },
      books: [{ id: 'GEN', source: 'gen.usfm' }],
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://v1.fetch.bible/bibles/manifest.json',
      'https://v1.fetch.bible/bibles/fra_test/extra.json',
    ]);
  });

  it('rejects a restricted direct request before fetching translation content', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(catalog('cc-by-nc')));
    await expect(fetchBibleManifest('fra_test')).rejects.toThrow(
      'not licensed for commercial use',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('routes bundled resources locally and validates remote filenames', () => {
    expect(translationResourceUrl('eng_webc', 'tob.usfm')).toBe(
      '/usfm/eng_webc/tob.usfm',
    );
    expect(translationResourceUrl('fra_test', 'gen.usfm')).toBe(
      'https://v1.fetch.bible/bibles/fra_test/usfm/gen.usfm',
    );
    expect(() => translationResourceUrl('../bad', 'gen.usfm')).toThrow();
    expect(() => translationResourceUrl('fra_test', '../extra.json')).toThrow();
  });
});
