import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../error';
import {
  fetchInterlinearChapter,
  groupInterlinearSelection,
} from './interlinear';

afterEach(() => vi.unstubAllGlobals());

const sampleChapter = {
  chapter: {
    number: 1,
    content: [
      {
        verse: 1,
        words: [
          {
            pos: 1,
            bsbPos: 2,
            language: 'hebrew',
            text: 'בְּרֵאשִׁ֖ית',
            transliteration: 'bə·rê·šîṯ',
            parsing: 'N-fs',
            parsingFull: 'Noun - feminine singular',
            strongs: 'H7225',
            gloss: 'In the beginning',
          },
          {
            pos: 2,
            bsbPos: 1,
            language: 'hebrew',
            text: 'אֵ֥ת',
            transliteration: '’êṯ',
            parsing: 'DirObjM',
            parsingFull: 'Direct object marker',
            strongs: null,
            gloss: null,
          },
        ],
      },
    ],
  },
};

describe('fetchInterlinearChapter', () => {
  it('normalizes words and retains missing glosses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(sampleChapter))),
    );

    const result = await fetchInterlinearChapter('GEN', 1);
    expect(result).toEqual({
      available: true,
      chapter: {
        book: 'GEN',
        chapter: 1,
        verses: [
          {
            verse: 1,
            words: [
              {
                pos: 1,
                bsbPos: 2,
                language: 'hebrew',
                text: 'בְּרֵאשִׁ֖ית',
                transliteration: 'bə·rê·šîṯ',
                strongs: 'H7225',
                gloss: 'In the beginning',
              },
              {
                pos: 2,
                bsbPos: 1,
                language: 'hebrew',
                text: 'אֵ֥ת',
                transliteration: '’êṯ',
                strongs: null,
                gloss: null,
              },
            ],
          },
        ],
      },
    });
  });

  it('reports an unavailable chapter on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(fetchInterlinearChapter('JOL', 4)).resolves.toEqual({
      available: false,
    });
  });

  it('rejects HTML fallbacks and malformed chapter payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 200 })),
    );
    await expect(fetchInterlinearChapter('GEN', 1)).rejects.toMatchObject({
      code: AppError.Code.ExternalServiceError,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ chapter: { number: 1 } })),
      ),
    );
    await expect(fetchInterlinearChapter('GEN', 1)).rejects.toMatchObject({
      code: AppError.Code.ExternalServiceError,
    });
  });

  it('rejects invalid book and chapter values before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchInterlinearChapter('../GEN', 1)).rejects.toMatchObject({
      code: AppError.Code.BadRequest,
    });
    await expect(fetchInterlinearChapter('GEN', 0)).rejects.toMatchObject({
      code: AppError.Code.BadRequest,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('groupInterlinearSelection', () => {
  it('groups verses by chapter in first-seen order and preserves verse order', () => {
    expect(
      groupInterlinearSelection(['JHN/3:2', 'JHN/3:1', 'JHN/4:1', 'GEN/1:3']),
    ).toEqual([
      {
        book: 'JHN',
        chapter: 3,
        verses: [
          { id: 'JHN/3:2', verse: 2 },
          { id: 'JHN/3:1', verse: 1 },
        ],
      },
      {
        book: 'JHN',
        chapter: 4,
        verses: [{ id: 'JHN/4:1', verse: 1 }],
      },
      {
        book: 'GEN',
        chapter: 1,
        verses: [{ id: 'GEN/1:3', verse: 3 }],
      },
    ]);
  });
});
