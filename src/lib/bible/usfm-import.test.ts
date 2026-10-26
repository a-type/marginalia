import { strToU8, zipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { TranslationManifest } from './manifests';
import { extractVerses } from './search';
import { inspectUSFM, readUSFMImport, splitUSFM } from './usfm-import';

const source = '\\id GEN\n\\h Genesis\n\\c 1\n\\v 1 In the beginning.';

describe('USFM imports', () => {
  it('accepts whole-Bible input with BOM/CRLF and partial translations', async () => {
    const file = new File(
      [
        '\uFEFF' +
          source.replaceAll('\n', '\r\n') +
          '\r\n' +
          source.replace('GEN', 'EXO'),
      ],
      'Bible.usfm',
    );
    const books = [];
    for await (const book of readUSFMImport(file)) books.push(book.book.id);
    expect(books).toEqual(['GEN', 'EXO']);
  });
  it('accepts nested ZIP books without a manifest and ignores sidecars', async () => {
    const archive = zipSync({
      'nested/book.sfm': strToU8(source),
      'book.sfm:Zone.Identifier': strToU8('ignored'),
    });
    const books = [];
    for await (const book of readUSFMImport(new File([archive], 'books.zip')))
      books.push(book.book.id);
    expect(books).toEqual(['GEN']);
  });
  it('rejects duplicate IDs, unsafe paths and invalid chapters', async () => {
    expect(() => inspectUSFM(source.replace('\\c 1', '\\c 2'))).toThrow(
      'chapter',
    );
    expect(() => splitUSFM('no markers')).toThrow('book ID');
    const duplicate = new File([source + '\n' + source], 'duplicate.usfm');
    const consume = async (file: File) => {
      for await (const book of readUSFMImport(file)) void book;
    };
    await expect(consume(duplicate)).rejects.toThrow('Duplicate');
    await expect(
      consume(
        new File([zipSync({ '../book.usfm': strToU8(source) })], 'bad.zip'),
      ),
    ).rejects.toThrow('Unsafe');
  });
  it('validates and prepares the shipped translation corpora', async () => {
    for (const translation of ['web-p', 'net']) {
      const manifest: TranslationManifest = JSON.parse(
        await readFile(`public/usfm/${translation}/manifest.json`, 'utf8'),
      );
      let total = 0;
      for (const book of manifest.books) {
        const text = await readFile(
          `public/usfm/${translation}/${book.source}`,
          'utf8',
        );
        const inspected = inspectUSFM(
          text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'),
        );
        expect(inspected.id).toBe(book.id);
        expect(inspected.chapters).toBe(book.chapters);
        total += extractVerses(text, book.id).length;
      }
      expect(total).toBeGreaterThan(1000);
    }
  }, 30_000);
});
