import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const defaultOutput = fileURLToPath(
  new URL('../app/public/usfm/', import.meta.url),
);
const bookOrder = (
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH ' +
  'EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON ' +
  'MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL ' +
  'EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'
).split(' ');

async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  return response;
}

export async function downloadUSFM(
  translation,
  { output = defaultOutput } = {},
) {
  if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(translation)) {
    throw new Error('Provide a Fetch Bible translation key, e.g. eng_asv');
  }
  const baseUrl = `https://v1.fetch.bible/bibles/${translation}/`;
  const extra = await (await request(`${baseUrl}extra.json`)).json();
  const names = extra?.book_names;
  if (!names || typeof names !== 'object' || Array.isArray(names)) {
    throw new Error('extra.json must contain book_names');
  }

  const books = Object.entries(names).map(([key, name]) => {
    const headings = extra.chapter_headings?.[key];
    if (
      !/^[a-z0-9]{3}$/.test(key) ||
      typeof name?.normal !== 'string' ||
      !name.normal.trim() ||
      !Array.isArray(headings) ||
      headings.length < 2 ||
      !headings.every((heading) => typeof heading === 'string')
    ) {
      throw new Error(`Invalid book metadata in extra.json: ${key}`);
    }
    return {
      id: key.toUpperCase(),
      source: `${key}.usfm`,
    };
  });
  if (!books.length) throw new Error('extra.json contains no books');

  const rank = (id) => {
    const index = bookOrder.indexOf(id);
    return index === -1 ? bookOrder.length : index;
  };
  books.sort((first, second) => rank(first.id) - rank(second.id));

  const directory = join(output, translation);
  await mkdir(directory, { recursive: true });
  for (const book of books) {
    const url = `${baseUrl}usfm/${book.source}`;
    const source = Buffer.from(await (await request(url)).arrayBuffer());
    const bookId = /^\uFEFF?\\id\s+(\S+)/.exec(source.toString('utf8'))?.[1];
    if (bookId?.toUpperCase() !== book.id) {
      throw new Error(`Invalid USFM book ID in ${url}`);
    }
    await writeFile(join(directory, book.source), source);
    console.log(`Downloaded ${translation}/${book.source}`);
  }

  await writeFile(
    join(directory, 'extra.json'),
    `${JSON.stringify(extra, null, 2)}\n`,
  );
  console.log(`Wrote ${translation}/extra.json (${books.length} books)`);
  return extra;
}

if (import.meta.main) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        output: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      console.log(
        'Usage: node scripts/download-usfm.mjs <translation> [--output app/public/usfm]',
      );
    } else {
      if (positionals.length !== 1) {
        throw new Error('Expected one translation key, e.g. eng_asv');
      }
      await downloadUSFM(positionals[0], values);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
