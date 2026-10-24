import { afterEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  listTranslations: vi.fn(),
  defaultDownloadSuppressed: vi.fn().mockResolvedValue(false),
}));

vi.mock('./translations', () => ({
  ...storage,
  cancelTranslation: vi.fn(),
  deleteTranslation: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

it.each([
  ['downloading', 'queued', 1, 2],
  ['ready', 'preparing', 1, 2],
  ['paused', 'queued', 0, 0],
  ['ready', 'ready', 0, 0],
])(
  'recovers %s/%s jobs after lease expiry without restarting paused or finished jobs',
  async (sourceStatus, searchStatus, initialCalls, recoveredCalls) => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        postMessage = postMessage;
      },
    );
    vi.stubGlobal('window', {
      location: { pathname: '/web/GEN/1' },
      addEventListener: vi.fn(),
    });
    storage.listTranslations.mockResolvedValue([
      {
        id: 'web',
        origin: 'remote',
        sourceStatus,
        searchStatus,
        owner: 'previous-worker',
        leaseUntil: Date.now() + 30_000,
      },
    ]);
    const { startTranslationService } = await import('./translation-jobs');
    startTranslationService();
    await vi.advanceTimersByTimeAsync(0);
    expect(postMessage).toHaveBeenCalledTimes(initialCalls);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(postMessage).toHaveBeenCalledTimes(recoveredCalls);
    if (recoveredCalls)
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'install', translationId: 'web' }),
      );
  },
);
