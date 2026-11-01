import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../error';
import { fetchLexiconEntry, normalizeStrongsId } from './lexicon';

afterEach(() => vi.unstubAllGlobals());

const sampleEntry = {
  dataset: { id: 'stepbible-lexicon' },
  entry: {
    id: 'H1254',
    language: 'hebrew',
    senses: [
      {
        id: 'H1254A',
        language: 'hebrew',
        lemma: 'בָּרָא',
        transliteration: 'ba.ra',
        partOfSpeech: 'V',
        gloss: 'to create',
        definition: 'to create\n\n__1. (Qal) to shape',
      },
      {
        id: 'H1254B',
        language: 'hebrew',
        lemma: 'בָּרָא',
        transliteration: 'ba.ra',
        partOfSpeech: 'V',
        gloss: 'to fatten',
        definition: 'to be fat',
      },
    ],
  },
};

describe('normalizeStrongsId', () => {
  it('zero-pads Strong numbers to four digits', () => {
    expect(normalizeStrongsId('H853')).toBe('H0853');
    expect(normalizeStrongsId('g3056')).toBe('G3056');
    expect(normalizeStrongsId('H0430')).toBe('H0430');
    expect(normalizeStrongsId('H1254a')).toBe('H1254A');
  });

  it('rejects malformed values', () => {
    expect(normalizeStrongsId('X1234')).toBeNull();
    expect(normalizeStrongsId('H')).toBeNull();
    expect(normalizeStrongsId('H0')).toBeNull();
    expect(normalizeStrongsId('H12345')).toBeNull();
    expect(normalizeStrongsId('../H1')).toBeNull();
  });
});

describe('fetchLexiconEntry', () => {
  it('requests the padded ID and returns every sense', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(sampleEntry)));
    vi.stubGlobal('fetch', fetch);

    const result = await fetchLexiconEntry('H1254');

    expect(String(fetch.mock.calls[0]?.[0 as never])).toBe(
      'https://bible.helloao.org/api/d/stepbible-lexicon/lexicon/H1254.json',
    );
    expect(result).toMatchObject({
      available: true,
      entry: {
        id: 'H1254',
        senses: [{ gloss: 'to create' }, { gloss: 'to fatten' }],
      },
    });
  });

  it('pads short IDs before requesting', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(sampleEntry)));
    vi.stubGlobal('fetch', fetch);

    await fetchLexiconEntry('H853');

    expect(String(fetch.mock.calls[0]?.[0 as never])).toMatch(
      /\/lexicon\/H0853\.json$/,
    );
  });

  it('reports an unavailable entry on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(fetchLexiconEntry('G9999')).resolves.toEqual({
      available: false,
    });
  });

  it('rejects invalid IDs without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchLexiconEntry('nope')).rejects.toBeInstanceOf(AppError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects HTML and malformed payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 200 })),
    );
    await expect(fetchLexiconEntry('G3056')).rejects.toBeInstanceOf(AppError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ entry: { id: 1 } }))),
    );
    await expect(fetchLexiconEntry('G3056')).rejects.toBeInstanceOf(AppError);
  });
});
