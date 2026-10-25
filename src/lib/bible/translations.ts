import { AppError } from '#/lib/error';
import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { TranslationManifest } from './manifests';
import { defaultTranslationId } from './manifests';
import type { SearchVerse } from './search';
import { corpusVersion } from './search';

export interface StoredTranslation {
  id: string;
  manifest: TranslationManifest;
  origin: 'remote' | 'import';
  generation: string;
  sourceStatus: 'downloading' | 'paused' | 'error' | 'ready';
  searchStatus: 'queued' | 'preparing' | 'error' | 'ready';
  sourceBytes: number;
  preparedBytes: number;
  downloaded: number;
  prepared: number;
  corpusVersion: number;
  error?: string;
  owner?: string;
  leaseUntil?: number;
}

interface StoredBook {
  translationId: string;
  generation: string;
  bookId: string;
  source: string;
  bytes: number;
}

interface PreparedBook {
  translationId: string;
  generation: string;
  bookId: string;
  version: number;
  verses: SearchVerse[];
  bytes: number;
}

interface TranslationDatabase extends DBSchema {
  translations: { key: string; value: StoredTranslation };
  books: {
    key: [string, string];
    value: StoredBook;
    indexes: { translation: string };
  };
  prepared: {
    key: [string, string];
    value: PreparedBook;
    indexes: { translation: string };
  };
  preferences: { key: string; value: boolean | number };
}

let database: Promise<IDBPDatabase<TranslationDatabase>> | undefined;
let channel: BroadcastChannel | undefined;
const listeners = new Set<() => void>();

function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('margins-translations');
    channel.onmessage = () => listeners.forEach((listener) => listener());
  }
  return channel;
}

export function subscribeTranslations(listener: () => void) {
  getChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed() {
  getChannel()?.postMessage('changed');
  listeners.forEach((listener) => listener());
}

export function translationDatabase() {
  if (!database) {
    database = openDB<TranslationDatabase>('margins-translations', 1, {
      upgrade(db) {
        db.createObjectStore('translations', { keyPath: 'id' });
        db.createObjectStore('books', {
          keyPath: ['translationId', 'bookId'],
        }).createIndex('translation', 'translationId');
        db.createObjectStore('prepared', {
          keyPath: ['translationId', 'bookId'],
        }).createIndex('translation', 'translationId');
        db.createObjectStore('preferences');
      },
      blocking() {
        void database?.then((db) => db.close());
        database = undefined;
      },
      terminated() {
        database = undefined;
      },
    }).catch((error: unknown) => {
      database = undefined;
      throw AppError.wrap(error);
    });
  }
  return database;
}

export async function listTranslations() {
  return (await translationDatabase()).getAll('translations');
}

export async function getTranslation(id: string) {
  return (await translationDatabase()).get('translations', id);
}

export async function getStoredBook(id: string, bookId: string) {
  return (await translationDatabase()).get('books', [id, bookId]);
}

export async function getPreparedBook(id: string, bookId: string) {
  return (await translationDatabase()).get('prepared', [id, bookId]);
}

export async function defaultDownloadSuppressed() {
  return Boolean(
    await (await translationDatabase()).get('preferences', 'suppress-default'),
  );
}

export async function translationEpoch(id: string) {
  return Number(
    (await (await translationDatabase()).get('preferences', `epoch:${id}`)) ??
      0,
  );
}

export async function beginTranslation(
  manifest: TranslationManifest,
  origin: StoredTranslation['origin'],
  owner: string,
  explicit = false,
  expectedEpoch?: number,
) {
  const db = await translationDatabase();
  const transaction = db.transaction(
    ['translations', 'preferences'],
    'readwrite',
  );
  const epoch = Number(
    (await transaction
      .objectStore('preferences')
      .get(`epoch:${manifest.id}`)) ?? 0,
  );
  if (expectedEpoch !== undefined && epoch !== expectedEpoch) {
    await transaction.done;
    throw new DOMException('Translation job canceled', 'AbortError');
  }
  const existing = await transaction
    .objectStore('translations')
    .get(manifest.id);
  if (
    existing?.owner &&
    existing.owner !== owner &&
    (existing.leaseUntil ?? 0) > Date.now()
  ) {
    await transaction.done;
    return undefined;
  }
  if (
    !explicit &&
    manifest.id === defaultTranslationId &&
    (await transaction.objectStore('preferences').get('suppress-default'))
  ) {
    await transaction.done;
    return undefined;
  }
  const record: StoredTranslation = existing ?? {
    id: manifest.id,
    manifest,
    origin,
    generation: crypto.randomUUID(),
    sourceStatus: 'downloading',
    searchStatus: 'queued',
    sourceBytes: 0,
    preparedBytes: 0,
    downloaded: 0,
    prepared: 0,
    corpusVersion,
  };
  record.owner = owner;
  record.leaseUntil = Date.now() + 30_000;
  record.error = undefined;
  if (record.sourceStatus !== 'ready') record.sourceStatus = 'downloading';
  await transaction.objectStore('translations').put(record);
  if (explicit && record.id === defaultTranslationId)
    await transaction.objectStore('preferences').put(false, 'suppress-default');
  await transaction.done;
  changed();
  return record;
}

export async function updateTranslation(
  record: StoredTranslation,
  patch: Partial<StoredTranslation>,
) {
  const db = await translationDatabase();
  const transaction = db.transaction('translations', 'readwrite');
  const current = await transaction.store.get(record.id);
  assertOwner(current, record);
  await transaction.store.put({
    ...current,
    ...patch,
    leaseUntil: Date.now() + 30_000,
  });
  await transaction.done;
  changed();
}

function assertOwner(
  current: StoredTranslation | undefined,
  record: StoredTranslation,
): asserts current is StoredTranslation {
  if (
    !current ||
    current.generation !== record.generation ||
    current.owner !== record.owner
  ) {
    throw new DOMException('Translation job canceled', 'AbortError');
  }
}

export async function saveBook(
  record: StoredTranslation,
  bookId: string,
  source: string,
) {
  const bytes = new TextEncoder().encode(source).byteLength;
  const db = await translationDatabase();
  const transaction = db.transaction(['translations', 'books'], 'readwrite');
  const current = await transaction.objectStore('translations').get(record.id);
  assertOwner(current, record);
  const previous = await transaction
    .objectStore('books')
    .get([record.id, bookId]);
  await transaction.objectStore('books').put({
    translationId: record.id,
    generation: record.generation,
    bookId,
    source,
    bytes,
  });
  await transaction.objectStore('translations').put({
    ...current,
    downloaded: current.downloaded + (previous ? 0 : 1),
    sourceBytes: current.sourceBytes + bytes - (previous?.bytes ?? 0),
    leaseUntil: Date.now() + 30_000,
  });
  await transaction.done;
  changed();
}

export async function savePreparedBook(
  record: StoredTranslation,
  bookId: string,
  verses: SearchVerse[],
) {
  const bytes = new TextEncoder().encode(JSON.stringify(verses)).byteLength;
  const db = await translationDatabase();
  const transaction = db.transaction(['translations', 'prepared'], 'readwrite');
  const current = await transaction.objectStore('translations').get(record.id);
  assertOwner(current, record);
  const previous = await transaction
    .objectStore('prepared')
    .get([record.id, bookId]);
  await transaction.objectStore('prepared').put({
    translationId: record.id,
    generation: record.generation,
    bookId,
    version: corpusVersion,
    verses,
    bytes,
  });
  await transaction.objectStore('translations').put({
    ...current,
    prepared: current.prepared + (previous ? 0 : 1),
    preparedBytes: current.preparedBytes + bytes - (previous?.bytes ?? 0),
    leaseUntil: Date.now() + 30_000,
  });
  await transaction.done;
  changed();
}

export async function cancelTranslation(id: string) {
  const db = await translationDatabase();
  const transaction = db.transaction(
    ['translations', 'preferences'],
    'readwrite',
  );
  const epoch = Number(
    (await transaction.objectStore('preferences').get(`epoch:${id}`)) ?? 0,
  );
  await transaction.objectStore('preferences').put(epoch + 1, `epoch:${id}`);
  const record = await transaction.objectStore('translations').get(id);
  if (record)
    await transaction.objectStore('translations').put({
      ...record,
      owner: undefined,
      leaseUntil: undefined,
      sourceStatus: record.sourceStatus === 'ready' ? 'ready' : 'paused',
      searchStatus: record.searchStatus === 'ready' ? 'ready' : 'queued',
    });
  await transaction.done;
  changed();
}

export async function deleteTranslation(id: string, suppressDefault = true) {
  const db = await translationDatabase();
  const transaction = db.transaction(
    ['translations', 'books', 'prepared', 'preferences'],
    'readwrite',
  );
  const epoch = Number(
    (await transaction.objectStore('preferences').get(`epoch:${id}`)) ?? 0,
  );
  await transaction.objectStore('preferences').put(epoch + 1, `epoch:${id}`);
  await transaction.objectStore('translations').delete(id);
  for (const name of ['books', 'prepared'] as const) {
    const keys = await transaction
      .objectStore(name)
      .index('translation')
      .getAllKeys(id);
    for (const key of keys) await transaction.objectStore(name).delete(key);
  }
  if (id === defaultTranslationId && suppressDefault)
    await transaction.objectStore('preferences').put(true, 'suppress-default');
  await transaction.done;
  changed();
}
