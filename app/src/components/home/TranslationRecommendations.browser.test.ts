import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { builtinTranslations } from '../../lib/bible/manifests';
import { TranslationRecommendations } from './TranslationRecommendations';

const { addTab, downloadTranslation } = vi.hoisted(() => ({
  addTab: vi.fn(),
  downloadTranslation: vi.fn(),
}));
vi.mock('../../lib/bible/translation-jobs', () => ({
  downloadTranslation,
}));
vi.mock('#/paraglide/messages', () => ({
  m: {
    annotation_cancel: () => 'Cancel',
    translation_downloaded: () => 'Available offline',
    translation_downloading: () => 'Downloading',
    translation_error: () => 'Download failed',
    translation_preparing: () => 'Preparing search',
    translation_retry: () => 'Retry',
  },
}));
vi.mock('../../queries/translations', () => ({
  translationsQueryOptions: {
    queryKey: ['translations'],
    queryFn: () => [],
    staleTime: Infinity,
  },
}));
vi.mock('../app/readingTabs', () => ({
  useAddReadingTab: () => addTab,
}));
vi.mock('../settings/TranslationManagerDialog', () => ({
  TranslationManagerDialog: () => null,
}));

afterEach(() => vi.clearAllMocks());

it('waits for the selected translation download before opening its reading tab', async () => {
  const translation = builtinTranslations[0];
  let resolveDownload!: () => void;
  downloadTranslation.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      }),
  );

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TranslationRecommendations),
      ),
    ),
  );

  try {
    await page.getByText(translation.title, { exact: true }).click();
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Downloading');
    expect(downloadTranslation).toHaveBeenCalledWith(translation.id);
    expect(addTab).not.toHaveBeenCalled();

    resolveDownload();
    await expect.poll(() => addTab.mock.calls.length).toBe(1);
    expect(addTab).toHaveBeenCalledWith({
      translation: translation.id,
      book: 'MAT',
      chapter: 1,
    });
  } finally {
    root.unmount();
    container.remove();
    client.clear();
  }
});
