import { AppError } from '#/lib/error';
import { Unzip, UnzipInflate } from 'fflate';
import type { TranslationBook } from './manifests';
import { isBookId } from './verse';

export const importLimits = {
  input: 100 * 1024 * 1024,
  output: 200 * 1024 * 1024,
  book: 25 * 1024 * 1024,
  entries: 1000,
  books: 200,
};

function invalid(message: string): never {
  throw new AppError(AppError.Code.BadRequest, message);
}

export function splitUSFM(source: string): string[] {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const starts = Array.from(
    normalized.matchAll(/^\\id\s+/gm),
    (match) => match.index,
  );
  if (!starts.length || normalized.slice(0, starts[0]).trim())
    invalid('USFM must begin with a book ID');
  if (starts.length > importLimits.books) invalid('Too many books');
  return starts.map((start, index) =>
    normalized.slice(start, starts[index + 1]),
  );
}

export function inspectUSFM(source: string): TranslationBook {
  if (new TextEncoder().encode(source).byteLength > importLimits.book)
    invalid('Book exceeds 25 MiB');
  const ids = Array.from(source.matchAll(/^\\id\s+(\S+)/gm));
  const id = ids[0]?.[1];
  if (ids.length !== 1 || !id || !isBookId(id) || /[\\\s:#?]/.test(id))
    invalid('Invalid or missing book ID');
  const chapters = Array.from(source.matchAll(/^\\c\s+(\S+)/gm), (match) =>
    Number(match[1]),
  );
  if (
    !chapters.length ||
    chapters.some(
      (chapter, index) =>
        !Number.isSafeInteger(chapter) || chapter !== index + 1,
    )
  )
    invalid(`Invalid chapter sequence in ${id}`);
  if (!/^\\v\s+/m.test(source)) invalid(`No verses in ${id}`);
  const title =
    /^\\(?:toc2|h|mt1?)\s+([^\n\\]+)/m.exec(source)?.[1].trim() || id;
  return { id, title, chapters: chapters.length };
}

export async function* readUSFMImport(
  file: File,
  signal?: AbortSignal,
): AsyncGenerator<{ book: TranslationBook; source: string }> {
  if (!file.size || file.size > importLimits.input)
    invalid('File must be between 1 byte and 100 MiB');
  const seen = new Set<string>();
  function accept(source: string) {
    const book = inspectUSFM(source);
    if (seen.has(book.id)) invalid(`Duplicate book: ${book.id}`);
    seen.add(book.id);
    if (seen.size > importLimits.books) invalid('Too many books');
    return { book, source };
  }
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    for (const book of splitUSFM(source)) {
      signal?.throwIfAborted();
      yield accept(book);
    }
    return;
  }
  let entries = 0;
  let output = 0;
  let failure: Error | undefined;
  const completed: string[] = [];
  const unzip = new Unzip((entry) => {
    if (++entries > importLimits.entries) invalid('Too many archive entries');
    if (
      /^[\\/]|^[a-z]:/i.test(entry.name) ||
      entry.name.replaceAll('\\', '/').split('/').includes('..')
    )
      invalid('Unsafe archive path');
    if (!/\.(usfm|sfm)$/i.test(entry.name)) return;
    let bytes = 0;
    let text = '';
    const decoder = new TextDecoder('utf-8', { fatal: true });
    entry.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      bytes += data.byteLength;
      output += data.byteLength;
      if (bytes > importLimits.book || output > importLimits.output) {
        entry.terminate();
        invalid('Archive exceeds decompressed size limits');
      }
      text += decoder.decode(data, { stream: !final });
      if (final) completed.push(text);
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      unzip.push(value ?? new Uint8Array(), done);
      if (failure) throw failure;
      while (completed.length) {
        for (const source of splitUSFM(completed.shift()!))
          yield accept(source);
      }
      if (done) break;
    }
    if (!seen.size) invalid('No USFM books found in archive');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
