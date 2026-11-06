import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { BibleLocation } from '../../lib/bible/location';
import type { TranslationManifest } from '../../lib/bible/source';
import { getTranslationBook } from '../../lib/bible/source';
import { AppError } from '../../lib/error';
import { readerBookSourceQueryOptions } from '../../queries/translations';
import {
  ContinuousChaptersController,
  getChapterWindow,
} from './ContinuousChaptersController';

export { CHAPTER_BUFFER } from './ContinuousChaptersController';

type BookSource = { bookId: string; source: string };

export function useContinuousChapters({
  location,
  manifest,
  sources,
  translationId,
  readingPosition,
  scrollProgress,
}: {
  location: BibleLocation;
  manifest: TranslationManifest;
  sources: BookSource[];
  translationId: string;
  readingPosition: BibleLocation | undefined;
  scrollProgress?: number;
}) {
  const [controller] = useState(
    () =>
      new ContinuousChaptersController(
        manifest,
        location,
        readingPosition,
        scrollProgress,
      ),
  );
  const { active, initialPositionSettled, scrubLocation } =
    useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    );
  const { chapters, before, after } = getChapterWindow(manifest, active);
  const bookIds = [...new Set(chapters.map((chapter) => chapter.bookId))];
  const queries = useQueries({
    queries: bookIds.map((bookId) => {
      const source = sources.find((entry) => entry.bookId === bookId)?.source;
      const book = getTranslationBook(manifest, bookId);
      if (!book)
        throw new AppError(
          AppError.Code.NotFound,
          `Book ${bookId} is unavailable`,
        );
      return {
        ...readerBookSourceQueryOptions(translationId, book),
        initialData: source,
      };
    }),
  });
  const frozenQueries = useRef<typeof queries | null>(null);
  const displayedQueries = frozenQueries.current ?? queries;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const renderKey = chapters
    .map((chapter) => `${chapter.bookId}/${chapter.chapter}`)
    .join(',');
  const sourceKey = displayedQueries
    .map((query) => `${query.status}/${query.dataUpdatedAt}`)
    .join(',');

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const beforeElement = beforeRef.current;
    const afterElement = afterRef.current;
    if (!viewport || !content || !beforeElement || !afterElement) return;
    controller.commit(
      {
        viewport,
        content,
        before: beforeElement,
        after: afterElement,
      },
      manifest,
    );
    return () => controller.prepareForCommit();
  }, [
    controller,
    manifest,
    renderKey,
    sourceKey,
    before,
    after,
    scrubLocation === null,
  ]);

  useLayoutEffect(() => () => controller.destroy(), [controller]);

  return {
    active,
    initialPositionSettled,
    chapters,
    viewportRef,
    contentRef,
    beforeRef,
    afterRef,
    onScroll: controller.onScroll,
    scrubLocation,
    startScrubbing(pointerId: number) {
      if (frozenQueries.current) return;
      frozenQueries.current = queries;
      controller.startScrubbing(pointerId);
    },
    finishScrubbing(pointerId: number) {
      if (controller.getSnapshot().scrubLocation === null) return;
      controller.finishScrubbing(pointerId);
      if (controller.getSnapshot().scrubLocation === null)
        frozenQueries.current = null;
    },
    getScrollPosition: controller.getScrollPosition,
    goTo: controller.goTo,
    getSource(bookId: string): UseQueryResult<string, Error> {
      return displayedQueries[bookIds.indexOf(bookId)];
    },
  };
}
