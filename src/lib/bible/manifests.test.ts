import { describe, expect, it } from 'vitest';
import {
  builtinTranslations,
  isTranslationId,
  parseTranslationExtra,
} from './manifests';

const extra = {
  book_names: {
    tob: { normal: 'Tobit' },
    rev: { normal: 'Revelation' },
    exo: { normal: 'Exodus' },
    gen: { normal: 'Genesis' },
  },
  chapter_headings: {
    tob: ['', '', ''],
    rev: ['', 'Prologue'],
    exo: ['', 'Egypt'],
    gen: ['', 'Creation', 'Garden'],
  },
};

describe('Fetch Bible translation metadata', () => {
  it('infers names, chapter counts, filenames, and Bible order from extra.json', () => {
    expect(parseTranslationExtra(extra, 'eng_webc')).toEqual({
      id: 'eng_webc',
      title: 'World English Bible (Catholic)',
      metadata: builtinTranslations.find(
        (translation) => translation.id === 'eng_webc',
      )?.metadata,
      books: [
        { id: 'GEN', title: 'Genesis', chapters: 2, source: 'gen.usfm' },
        { id: 'EXO', title: 'Exodus', chapters: 1, source: 'exo.usfm' },
        { id: 'TOB', title: 'Tobit', chapters: 2, source: 'tob.usfm' },
        { id: 'REV', title: 'Revelation', chapters: 1, source: 'rev.usfm' },
      ],
    });
  });

  it('uses the translation key when there is no built-in title', () => {
    expect(parseTranslationExtra(extra, 'eng_example').title).toBe(
      'eng_example',
    );
  });

  it.each([
    null,
    {},
    { book_names: {}, chapter_headings: {} },
    { ...extra, book_names: [] },
    { ...extra, chapter_headings: [] },
    { ...extra, book_names: { gen: { normal: ' ' } } },
    { ...extra, chapter_headings: { ...extra.chapter_headings, gen: [''] } },
    { ...extra, chapter_headings: { ...extra.chapter_headings, gen: ['', 1] } },
    { ...extra, book_names: { '../gen': { normal: 'Genesis' } } },
  ])('rejects invalid metadata: %j', (value) => {
    expect(() => parseTranslationExtra(value, 'eng_webu')).toThrow(
      'Invalid translation metadata',
    );
  });

  it('accepts Fetch Bible and local import keys but rejects unsafe paths', () => {
    expect(isTranslationId('eng_webu')).toBe(true);
    expect(isTranslationId('local-example')).toBe(true);
    expect(isTranslationId('../eng_webu')).toBe(false);
    expect(() => parseTranslationExtra(extra, '../eng_webu')).toThrow(
      'Invalid translation metadata',
    );
  });
});
