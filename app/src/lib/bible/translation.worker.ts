import { AppError } from '../error';
import { fetchBibleManifest, translationResourceUrl } from './fetch-bible';
import type { TranslationManifest } from './manifests';
import { builtinTranslations, parseTranslationExtra } from './manifests';
import type { SearchToken, SearchVerse } from './search';
import {
  corpusVersion,
  extractVerses,
  matchesSearch,
  parseSearchQuery,
  searchRanges,
  tokenize,
} from './search';
import type {
  SearchResult,
  WorkerRequest,
  WorkerResponse,
} from './translation-jobs';
import type { StoredTranslation } from './translations';
import {
  beginTranslation,
  deleteTranslation,
  getPreparedBook,
  getStoredBook,
  getTranslation,
  saveBook,
  savePreparedBook,
  subscribeTranslations,
  translationEpoch,
  updateTranslation,
} from './translations';
import { inspectUSFM, readUSFMImport } from './usfm-import';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: WorkerResponse) => void;
};
const jobs = new Map<string, AbortController>();
let activeSearch = 0;
type CachedVerse = { verse: SearchVerse; tokens: SearchToken[] };
let cache:
  | {
      id: string;
      generation: string;
      books: CachedVerse[][];
      query?: string;
      matches?: CachedVerse[];
    }
  | undefined;

function yieldTask() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

subscribeTranslations(() => {
  const current = cache;
  if (current)
    void getTranslation(current.id).then((record) => {
      if (
        cache === current &&
        (!record ||
          record.generation !== current.generation ||
          record.searchStatus !== 'ready' ||
          record.corpusVersion !== corpusVersion)
      ) {
        cache = undefined;
        activeSearch = 0;
      }
    });
});

async function preview(file: File): Promise<TranslationManifest> {
  const books = [];
  for await (const { book } of readUSFMImport(file)) {
    books.push(book);
    await yieldTask();
  }
  return {
    id: `local-${crypto.randomUUID()}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    books,
  };
}

async function fetchRemote(path: string, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(path, { signal, priority: 'low' });
      if (response.ok) return response;
      if (response.status < 500 || attempt >= 2)
        throw new AppError(
          AppError.Code.ExternalServiceError,
          `Download failed (${response.status}): ${path}`,
        );
    } catch (error) {
      if (signal.aborted || error instanceof AppError || attempt >= 2)
        throw error;
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, 500 * 2 ** attempt),
    );
    signal.throwIfAborted();
  }
}

async function install(
  request: Extract<WorkerRequest, { action: 'install' | 'import' }>,
) {
  const id = request.translationId;
  if (jobs.has(id)) return;
  const controller = new AbortController();
  jobs.set(id, controller);
  let record: StoredTranslation | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const epoch = await translationEpoch(id);
    let manifest = (await getTranslation(id))?.manifest;
    if (request.action === 'import') {
      manifest = {
        ...(await preview(request.file)),
        id,
        title: request.title.trim().slice(0, 200) || request.file.name,
      };
    } else if (!manifest) {
      manifest = builtinTranslations.some(
        (translation) => translation.id === id,
      )
        ? parseTranslationExtra(
            await (
              await fetchRemote(`/usfm/${id}/extra.json`, controller.signal)
            ).json(),
            id,
          )
        : await fetchBibleManifest(id, controller.signal);
    }
    controller.signal.throwIfAborted();
    record = await beginTranslation(
      manifest,
      request.action === 'import' || id.startsWith('local-')
        ? 'import'
        : 'remote',
      crypto.randomUUID(),
      request.action === 'import' || request.explicit,
      epoch,
    );
    if (!record) return;
    const owned = record;
    heartbeat = setInterval(() => {
      void updateTranslation(owned, {}).catch(() => controller.abort());
    }, 10_000);
    controller.signal.throwIfAborted();
    if (request.action === 'import') {
      for await (const { book, source } of readUSFMImport(
        request.file,
        controller.signal,
      )) {
        extractVerses(source, book.id);
        await saveBook(record, book.id, source);
        await yieldTask();
      }
    } else if (record.sourceStatus !== 'ready') {
      const books = [...record.manifest.books].sort(
        (left, right) =>
          Number(right.id === request.priorityBook) -
          Number(left.id === request.priorityBook),
      );
      for (const book of books) {
        controller.signal.throwIfAborted();
        if (await getStoredBook(id, book.id)) continue;
        const source = await (
          await fetchRemote(
            translationResourceUrl(id, book.source ?? ''),
            controller.signal,
          )
        ).text();
        const inspected = inspectUSFM(
          source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'),
        );
        if (inspected.id !== book.id || inspected.chapters !== book.chapters)
          throw new AppError(
            AppError.Code.BadRequest,
            `Book does not match translation metadata: ${book.id}`,
          );
        await saveBook(record, book.id, source);
      }
    }
    await updateTranslation(record, {
      sourceStatus: 'ready',
      searchStatus: 'preparing',
    });
    for (const book of record.manifest.books) {
      controller.signal.throwIfAborted();
      const prepared = await getPreparedBook(id, book.id);
      if (
        prepared?.generation === record.generation &&
        prepared.version === corpusVersion
      )
        continue;
      const stored = await getStoredBook(id, book.id);
      if (!stored)
        throw new AppError(AppError.Code.NotFound, `Missing book: ${book.id}`);
      await savePreparedBook(
        record,
        book.id,
        extractVerses(stored.source, book.id),
      );
      await yieldTask();
    }
    await updateTranslation(record, {
      searchStatus: 'ready',
      corpusVersion,
      owner: undefined,
      error: undefined,
    });
  } catch (error) {
    if (record) {
      const latest = await getTranslation(id);
      if (
        latest?.generation === record.generation &&
        latest.origin === 'import' &&
        latest.sourceStatus !== 'ready'
      ) {
        await deleteTranslation(id, false);
      } else if (latest && latest.owner === record.owner) {
        await updateTranslation(record, {
          sourceStatus: latest.sourceStatus === 'ready' ? 'ready' : 'error',
          searchStatus: latest.sourceStatus === 'ready' ? 'error' : 'queued',
          owner: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
    jobs.delete(id);
  }
}

async function search(
  request: Extract<WorkerRequest, { action: 'search' }>,
): Promise<SearchResult> {
  activeSearch = request.requestId;
  const check = () => {
    if (activeSearch !== request.requestId)
      throw new DOMException('Search canceled', 'AbortError');
  };
  const record = await getTranslation(request.translationId);
  check();
  if (
    !record ||
    record.sourceStatus !== 'ready' ||
    record.searchStatus !== 'ready' ||
    record.corpusVersion !== corpusVersion
  )
    throw new AppError(
      AppError.Code.Conflict,
      'Translation is not ready for search',
    );
  if (
    request.bookId &&
    !record.manifest.books.some((book) => book.id === request.bookId)
  )
    throw new AppError(AppError.Code.BadRequest, 'Book is not in this edition');
  if (cache?.id !== record.id || cache.generation !== record.generation) {
    cache = undefined;
    const books: CachedVerse[][] = [];
    for (const book of record.manifest.books) {
      const prepared = await getPreparedBook(record.id, book.id);
      check();
      if (
        !prepared ||
        prepared.version !== corpusVersion ||
        prepared.generation !== record.generation
      )
        throw new AppError(
          AppError.Code.Conflict,
          'Prepared text is missing. Retry preparation.',
        );
      books.push(
        prepared.verses.map((verse) => ({
          verse,
          tokens: tokenize(verse.text),
        })),
      );
      await yieldTask();
      check();
    }
    cache = { id: record.id, generation: record.generation, books };
  }
  const current = cache;
  const query = parseSearchQuery(request.query);
  if (current.query !== request.query) {
    const matches: CachedVerse[] = [];
    for (const book of current.books) {
      for (let index = 0; index < book.length; index++) {
        if (matchesSearch(book[index].tokens, query)) matches.push(book[index]);
        if (index && index % 500 === 0) {
          await yieldTask();
          check();
        }
      }
      await yieldTask();
      check();
    }
    current.query = request.query;
    current.matches = matches;
  }
  const latest = await getTranslation(record.id);
  check();
  if (
    !latest ||
    latest.generation !== record.generation ||
    latest.searchStatus !== 'ready'
  )
    throw new DOMException('Translation changed', 'AbortError');
  const matches = request.bookId
    ? (current.matches ?? []).filter(({ verse }) =>
        verse.id.startsWith(`${request.bookId}/`),
      )
    : (current.matches ?? []);
  const start = Math.max(0, Math.floor(request.page)) * 50;
  return {
    total: matches.length,
    verses: matches.slice(start, start + 50).map(({ verse, tokens }) => ({
      ...verse,
      ranges: searchRanges(tokens, query),
    })),
  };
}

scope.onmessage = ({ data }) => {
  if (data.action === 'cancelSearch') {
    if (activeSearch === data.requestId) activeSearch = 0;
    return;
  }
  if (data.action === 'cancel') {
    jobs.get(data.translationId)?.abort();
    if (cache?.id === data.translationId) {
      cache = undefined;
      activeSearch = 0;
    }
    scope.postMessage({ requestId: data.requestId });
    return;
  }
  const operation =
    data.action === 'preview'
      ? preview(data.file)
      : data.action === 'search'
        ? search(data)
        : install(data);
  void operation.then(
    (result) => scope.postMessage({ requestId: data.requestId, result }),
    (error: unknown) => {
      scope.postMessage({
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );
};
