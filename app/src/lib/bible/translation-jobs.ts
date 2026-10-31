import { AppError } from '../error';
import { defaultTranslationId, type TranslationManifest } from './manifests';
import type { SearchVerse } from './search';
import {
  cancelTranslation,
  defaultDownloadSuppressed,
  deleteTranslation,
  listTranslations,
} from './translations';

export type TranslationCommand =
  | {
      action: 'install';
      translationId: string;
      explicit: boolean;
      priorityBook?: string;
    }
  | { action: 'preview'; file: File }
  | { action: 'import'; file: File; translationId: string; title: string }
  | { action: 'cancel'; translationId: string }
  | {
      action: 'search';
      translationId: string;
      query: string;
      page: number;
      bookId?: string;
    }
  | { action: 'cancelSearch'; requestId: number };
export type WorkerRequest = TranslationCommand & { requestId: number };
export interface SearchResult {
  total: number;
  verses: (SearchVerse & { ranges: [number, number][] })[];
}
export interface WorkerResponse {
  requestId: number;
  result?: unknown;
  error?: string;
}

let worker: Worker | undefined;
let nextRequest = 0;
const pending = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./translation.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const request = pending.get(data.requestId);
      pending.delete(data.requestId);
      if (data.error)
        request?.reject(new AppError(AppError.Code.BadRequest, data.error));
      else request?.resolve(data.result);
    };
    worker.onerror = () => {
      const error = new AppError(
        AppError.Code.InternalServerError,
        'Translation worker stopped. Retry the operation.',
      );
      pending.forEach((request) => request.reject(error));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  return worker;
}

export function translationRequest<TResult>(
  command: TranslationCommand,
  signal?: AbortSignal,
): Promise<TResult> {
  signal?.throwIfAborted();
  const requestId = ++nextRequest;
  return new Promise<TResult>((resolve, reject) => {
    const abort = () => {
      pending.delete(requestId);
      getWorker().postMessage({ action: 'cancelSearch', requestId });
      reject(new DOMException('Search canceled', 'AbortError'));
    };
    pending.set(requestId, {
      resolve: (result) => {
        signal?.removeEventListener('abort', abort);
        resolve(result as TResult);
      },
      reject: (error) => {
        signal?.removeEventListener('abort', abort);
        reject(error);
      },
    });
    signal?.addEventListener('abort', abort, { once: true });
    getWorker().postMessage({ ...command, requestId });
  });
}

export const downloadTranslation = (
  translationId: string,
  explicit = true,
  priorityBook?: string,
) =>
  translationRequest<void>({
    action: 'install',
    translationId,
    explicit,
    priorityBook,
  });
export const previewTranslation = (file: File) =>
  translationRequest<TranslationManifest>({ action: 'preview', file });
export const importTranslation = (
  file: File,
  title: string,
  translationId: string,
) => translationRequest<void>({ action: 'import', file, title, translationId });
export const searchTranslation = (
  translationId: string,
  query: string,
  page: number,
  signal?: AbortSignal,
  bookId?: string,
) =>
  translationRequest<SearchResult>(
    { action: 'search', translationId, query, page, bookId },
    signal,
  );

export async function stopTranslation(translationId: string) {
  await cancelTranslation(translationId);
  await translationRequest<void>({ action: 'cancel', translationId });
}

export async function removeTranslation(translationId: string) {
  await deleteTranslation(translationId);
  await translationRequest<void>({ action: 'cancel', translationId });
}

let started = false;
export function startTranslationService() {
  if (started || typeof window === 'undefined') return;
  getWorker();
  started = true;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  const resume = async () => {
    clearTimeout(recoveryTimer);
    try {
      const records = await listTranslations();
      const leasedJobs = records.filter(
        (record) =>
          record.owner &&
          record.sourceStatus !== 'paused' &&
          (record.sourceStatus !== 'ready' || record.searchStatus !== 'ready'),
      );
      if (leasedJobs.length) {
        recoveryTimer = setTimeout(
          () => void resume(),
          Math.max(
            1000,
            Math.min(...leasedJobs.map((record) => record.leaseUntil ?? 0)) -
              Date.now() +
              100,
          ),
        );
      }
      const priorityBook = window.location.pathname.split('/').at(-2);
      for (const record of records) {
        if (
          record.origin === 'import' &&
          record.sourceStatus !== 'ready' &&
          (!record.owner || (record.leaseUntil ?? 0) < Date.now())
        ) {
          await deleteTranslation(record.id, false);
        } else if (
          record.sourceStatus !== 'paused' &&
          (record.sourceStatus !== 'ready' || record.searchStatus !== 'ready')
        ) {
          void downloadTranslation(record.id, false, priorityBook).catch(
            () => {},
          );
        }
      }
      if (
        !(await defaultDownloadSuppressed()) &&
        !records.some((record) => record.id === defaultTranslationId)
      ) {
        void downloadTranslation(
          defaultTranslationId,
          false,
          priorityBook,
        ).catch(() => {});
      }
    } catch (error) {
      console.warn('Offline translation storage unavailable', error);
    }
  };
  window.addEventListener('online', () => {
    void resume();
  });
  window.addEventListener('focus', () => {
    void resume();
  });
  void resume();
}
