import type {
  CollectionConfig,
  LoadSubsetOptions,
  SyncConfig,
  UtilsRecord,
} from '@tanstack/react-db';
import { collectionOptions } from '@tanstack/react-db';

const databaseName = 'margins-annotations';
const databaseVersion = 4;
const annotationStore = 'annotations';
const syncStateStore = 'sync-state';
const bookChapterIndex = 'by-book-chapter';
const chapterIndex = 'by-chapter';
const verseIndex = 'by-verse';

interface AnnotationSyncState {
  ownerDid: string;
  lastSeenAnnotationId: string;
}

interface IndexedDbCollectionUtils<
  T extends { id: string },
> extends UtilsRecord {
  acceptMutations: (transaction: {
    mutations: IndexedDbMutation[];
  }) => Promise<void>;
  loadAll: () => Promise<T[]>;
}

type QueryExpression = {
  type?: string;
  name?: string;
  args?: QueryExpression[];
  path?: Array<string | number>;
  value?: unknown;
};

type IndexedDbLookup =
  | { kind: 'object-store'; key: IDBValidKey }
  | { kind: 'index'; name: typeof chapterIndex; key: string }
  | { kind: 'index'; name: typeof verseIndex; key: string }
  | {
      kind: 'index';
      name: typeof bookChapterIndex;
      key: [string | number, string | number];
    };

interface IndexedDbMutation {
  collection: { id: string };
  type: 'insert' | 'update' | 'delete';
  key: string;
  modified: unknown;
  original: unknown;
}

let databasePromise: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 2) {
        for (const storeName of [
          annotationStore,
          'annotation-verses',
          syncStateStore,
        ]) {
          if (database.objectStoreNames.contains(storeName)) {
            database.deleteObjectStore(storeName);
          }
        }
      } else if (event.oldVersion < 4) {
        for (const storeName of [annotationStore, syncStateStore]) {
          if (database.objectStoreNames.contains(storeName)) {
            database.deleteObjectStore(storeName);
          }
        }
      }
      const annotationObjectStore = database.objectStoreNames.contains(
        annotationStore,
      )
        ? request.transaction!.objectStore(annotationStore)
        : database.createObjectStore(annotationStore, { keyPath: 'id' });
      if (!annotationObjectStore.indexNames.contains(bookChapterIndex)) {
        annotationObjectStore.createIndex(bookChapterIndex, [
          'bookId',
          'chapter',
        ]);
      }
      if (!annotationObjectStore.indexNames.contains(chapterIndex)) {
        annotationObjectStore.createIndex(chapterIndex, 'chapterKeys', {
          multiEntry: true,
        });
      }
      if (!annotationObjectStore.indexNames.contains(verseIndex)) {
        annotationObjectStore.createIndex(verseIndex, 'verses', {
          multiEntry: true,
        });
      }
      if (!database.objectStoreNames.contains(syncStateStore)) {
        database.createObjectStore(syncStateStore, { keyPath: 'ownerDid' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB open was blocked'));
  }).catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

export function initializeAnnotationStorage() {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return openDatabase().then(() => undefined);
}

async function readRows<T>(
  storeName: string,
  memoryStore: Map<string, unknown>,
): Promise<T[]> {
  await initializeAnnotationStorage();
  if (typeof indexedDB === 'undefined') {
    return [...memoryStore.values()] as T[];
  }
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const complete = transactionComplete(transaction);
  const rows = await requestResult(transaction.objectStore(storeName).getAll());
  await complete;
  return rows as T[];
}

function resolveIndexedLookup(
  where: LoadSubsetOptions['where'],
): IndexedDbLookup | undefined {
  if (!where) return undefined;
  const clauses: QueryExpression[] = [];
  const collectClauses = (expression: QueryExpression) => {
    if (expression.type === 'func' && expression.name === 'and') {
      expression.args?.forEach(collectClauses);
    } else {
      clauses.push(expression);
    }
  };
  collectClauses(where);

  const equalities = new Map<string, string | number>();
  let arrayMembership: { field: string; key: string } | undefined;
  for (const clause of clauses) {
    if (clause.type !== 'func') continue;
    if (clause.name === 'eq' && clause.args?.length === 2) {
      const [left, right] = clause.args;
      const ref =
        left.type === 'ref' ? left : right.type === 'ref' ? right : null;
      const value =
        left.type === 'val'
          ? left.value
          : right.type === 'val'
            ? right.value
            : undefined;
      const field = ref?.path?.at(-1);
      if (
        typeof field === 'string' &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        equalities.set(field, value);
      }
    } else if (clause.name === 'in' && clause.args?.length === 2) {
      const [value, ref] = clause.args;
      if (
        value.type === 'val' &&
        typeof value.value === 'string' &&
        ref.type === 'ref' &&
        (ref.path?.at(-1) === 'verses' || ref.path?.at(-1) === 'chapterKeys')
      ) {
        arrayMembership = {
          field: ref.path.at(-1) as string,
          key: value.value,
        };
      }
    }
  }

  if (arrayMembership?.field === 'verses') {
    return { kind: 'index', name: verseIndex, key: arrayMembership.key };
  }
  if (arrayMembership?.field === 'chapterKeys') {
    return { kind: 'index', name: chapterIndex, key: arrayMembership.key };
  }
  if (equalities.has('bookId') && equalities.has('chapter')) {
    return {
      kind: 'index',
      name: bookChapterIndex,
      key: [equalities.get('bookId')!, equalities.get('chapter')!],
    };
  }
  const id = equalities.get('id');
  if (id !== undefined) return { kind: 'object-store', key: id };
  return undefined;
}

function matchesIndexedLookup<T>(record: T, lookup: IndexedDbLookup) {
  const row = record as Record<string, unknown>;
  if (lookup.kind === 'object-store') return row.id === lookup.key;
  if (lookup.name === verseIndex) {
    return Array.isArray(row.verses) && row.verses.includes(lookup.key);
  }
  if (lookup.name === chapterIndex) {
    return (
      Array.isArray(row.chapterKeys) && row.chapterKeys.includes(lookup.key)
    );
  }
  return row.bookId === lookup.key[0] && row.chapter === lookup.key[1];
}

async function readSubset<T>(
  storeName: string,
  memoryStore: Map<string, unknown>,
  options: LoadSubsetOptions,
): Promise<T[]> {
  const lookup = resolveIndexedLookup(options.where);
  if (typeof indexedDB === 'undefined') {
    const rows = await readRows<T>(storeName, memoryStore);
    return lookup
      ? rows.filter((row) => matchesIndexedLookup(row, lookup))
      : rows;
  }

  await initializeAnnotationStorage();
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const complete = transactionComplete(transaction);
  const objectStore = transaction.objectStore(storeName);
  let request: IDBRequest<T[]>;
  if (!lookup) {
    request = objectStore.getAll();
  } else if (lookup.kind === 'object-store') {
    request = objectStore.getAll(lookup.key);
  } else if (lookup.name === verseIndex || lookup.name === chapterIndex) {
    request = objectStore.index(lookup.name).getAll(lookup.key);
  } else {
    request = objectStore.index(lookup.name).getAll(lookup.key);
  }
  const rows = await requestResult(request);
  await complete;
  return options.signal?.aborted ? [] : rows;
}

async function persistMutations(
  storeName: string,
  mutations: readonly IndexedDbMutation[],
  memoryStore: Map<string, unknown>,
) {
  await initializeAnnotationStorage();
  if (typeof indexedDB === 'undefined') {
    for (const mutation of mutations) {
      if (mutation.type === 'delete') {
        memoryStore.delete(mutation.key);
      } else if (mutation.modified && typeof mutation.modified === 'object') {
        memoryStore.set(mutation.key, mutation.modified);
      }
    }
    return;
  }
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  for (const mutation of mutations) {
    if (mutation.type === 'delete') {
      store.delete(mutation.key);
    } else if (mutation.modified && typeof mutation.modified === 'object') {
      store.put(mutation.modified);
    }
  }
  await transactionComplete(transaction);
}

function markReadyWhenActive(
  lifetime: { active: boolean },
  markReady: () => void,
) {
  if (lifetime.active) markReady();
}

export function indexedDbCollectionOptions<
  T extends { id: string },
  TKey extends string = string,
>(options: {
  id: string;
  storeName: string;
  defaultIndexType?: CollectionConfig<T, TKey>['defaultIndexType'];
  autoIndex?: CollectionConfig<T, TKey>['autoIndex'];
  syncMode?: CollectionConfig<T, TKey>['syncMode'];
}) {
  const { id, storeName, defaultIndexType, autoIndex, syncMode } = options;
  return collectionOptions(id, () => {
    type SyncParams = Parameters<SyncConfig<T, TKey>['sync']>[0];
    let syncParams: SyncParams | undefined;
    const memoryStore = new Map<string, unknown>();
    let syncQueue = Promise.resolve();

    const enqueueSyncWrite = (write: () => Promise<void>) => {
      const operation = syncQueue.then(write);
      syncQueue = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    };

    const publishRecords = (
      records: readonly T[],
      params: SyncParams,
      signal?: AbortSignal,
      isActive: () => boolean = () => true,
    ) =>
      enqueueSyncWrite(async () => {
        if (!isActive() || signal?.aborted) return;
        const newRecords = records.filter(
          (record) => !params.collection.has(record.id as TKey),
        );
        if (newRecords.length === 0) return;
        params.begin();
        for (const record of newRecords) {
          params.write({ type: 'insert', value: record });
        }
        await params.commit(signal);
      });

    const loadAll = async () => {
      const records = await readRows<T>(storeName, memoryStore);
      const params = syncParams;
      if (params) await publishRecords(records, params);
      return records;
    };

    const persistAndConfirm = async (
      mutations: readonly IndexedDbMutation[],
    ) => {
      const relevantMutations = mutations.filter(
        (mutation) => mutation.collection.id === id,
      );
      if (relevantMutations.length === 0) return;

      await persistMutations(storeName, relevantMutations, memoryStore);
      await enqueueSyncWrite(async () => {
        const params = syncParams;
        if (!params) return;
        params.begin({ immediate: true });
        for (const mutation of relevantMutations) {
          if (mutation.type === 'delete') {
            params.write({ type: 'delete', key: mutation.key as TKey });
          } else if (mutation.type === 'update') {
            params.write({
              type: 'update',
              value: mutation.modified as T,
              previousValue: mutation.original as T,
            });
          } else {
            params.write({
              type: 'insert',
              value: mutation.modified as T,
            });
          }
        }
        await params.commit();
      });
    };

    return {
      id,
      ...(defaultIndexType ? { defaultIndexType } : {}),
      ...(autoIndex ? { autoIndex } : {}),
      ...(syncMode ? { syncMode } : {}),
      getKey: (record: T) => record.id as TKey,
      sync: {
        sync: (params) => {
          syncParams = params;
          const lifetime = { active: true };
          const cleanup = () => {
            lifetime.active = false;
            if (syncParams === params) syncParams = undefined;
          };

          if (syncMode === 'on-demand') {
            void enqueueSyncWrite(async () => {
              params.begin();
              await params.commit();
            })
              .then(() => {
                if (lifetime.active) params.markReady();
              })
              .catch((error: unknown) => {
                if (lifetime.active) params.markError(error);
              });
            return {
              cleanup,
              loadSubset: async (subsetOptions: LoadSubsetOptions) => {
                const records = await readSubset<T>(
                  storeName,
                  memoryStore,
                  subsetOptions,
                );
                await publishRecords(
                  records,
                  params,
                  subsetOptions.signal,
                  () => lifetime.active,
                );
              },
            };
          }

          void readRows<T>(storeName, memoryStore)
            .then(async (records) => {
              await publishRecords(
                records,
                params,
                undefined,
                () => lifetime.active,
              );
              markReadyWhenActive(lifetime, params.markReady);
            })
            .catch((error: unknown) => {
              if (lifetime.active) params.markError(error);
            });

          return cleanup;
        },
      },
      onInsert: ({ transaction }) => persistAndConfirm(transaction.mutations),
      onUpdate: ({ transaction }) => persistAndConfirm(transaction.mutations),
      onDelete: ({ transaction }) => persistAndConfirm(transaction.mutations),
      utils: {
        acceptMutations: ({ mutations }) => persistAndConfirm(mutations),
        loadAll,
      },
    } satisfies CollectionConfig<T, TKey, never, IndexedDbCollectionUtils<T>>;
  });
}

export async function readAnnotationLastSeen(ownerDid: string) {
  await initializeAnnotationStorage();
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }
  const database = await openDatabase();
  const transaction = database.transaction(syncStateStore, 'readonly');
  const complete = transactionComplete(transaction);
  const state = await requestResult(
    transaction.objectStore(syncStateStore).get(ownerDid),
  );
  await complete;
  return (state as AnnotationSyncState | undefined)?.lastSeenAnnotationId;
}

export async function writeAnnotationLastSeen(
  ownerDid: string,
  lastSeenAnnotationId: string,
) {
  await initializeAnnotationStorage();
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  const transaction = database.transaction(syncStateStore, 'readwrite');
  transaction.objectStore(syncStateStore).put({
    ownerDid,
    lastSeenAnnotationId,
  } satisfies AnnotationSyncState);
  await transactionComplete(transaction);
}
