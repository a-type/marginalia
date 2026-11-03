import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';

import type { BibleLocation } from '../../lib/bible/location';
import { getAdjacentChapter } from '../../lib/bible/navigation';
import type { TranslationManifest } from '../../lib/bible/source';
import { getTranslationBook } from '../../lib/bible/source';
import { AppError } from '../../lib/error';
import { readerBookSourceQueryOptions } from '../../queries/translations';

type BookSource = { bookId: string; source: string };

const CHAPTER_BUFFER = 3;

export function useContinuousChapters({
  location,
  manifest,
  sources,
  translationId,
  readingPosition,
}: {
  location: BibleLocation;
  manifest: TranslationManifest;
  sources: BookSource[];
  translationId: string;
  readingPosition: BibleLocation | undefined;
}) {
  const [active, setActive] = useState<BibleLocation>(() => {
    if (readingPosition) {
      const book = getTranslationBook(manifest, readingPosition.bookId);
      if (
        book &&
        readingPosition.chapter >= 1 &&
        readingPosition.chapter <= book.chapters
      )
        return readingPosition;
    }
    return location;
  });
  const chapters = [active];
  for (const direction of [-1, 1] as const) {
    let chapter = active;
    for (let i = 0; i < CHAPTER_BUFFER; i++) {
      const adjacent = getAdjacentChapter(manifest, chapter, direction);
      if (!adjacent) break;
      if (direction === -1) chapters.unshift(adjacent);
      else chapters.push(adjacent);
      chapter = adjacent;
    }
  }
  const bookIds = [...new Set(chapters.map((chapter) => chapter.bookId))];
  const firstChapter = chapters[0];
  const chaptersBefore =
    manifest.books
      .slice(
        0,
        manifest.books.findIndex((book) => book.id === firstChapter.bookId),
      )
      .reduce((total, book) => total + book.chapters, 0) +
    firstChapter.chapter -
    1;
  const totalChapters = manifest.books.reduce(
    (total, book) => total + book.chapters,
    0,
  );
  const chaptersAfter = totalChapters - chaptersBefore - chapters.length;
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const scrub = useRef<{
    pointerId: number;
    queries: typeof queries;
  } | null>(null);
  const [scrubLocation, setScrubLocation] = useState<BibleLocation | null>(
    null,
  );
  const [bufferRevision, setBufferRevision] = useState(0);
  const buffersNeedUpdate = useRef(false);
  const displayedQueries = scrub.current?.queries ?? queries;
  const averageHeight = useRef(0);
  const anchor = useRef<{ key: string; top: number } | null>(null);
  const jump = useRef<number | null>(null);
  const initialized = useRef(false);
  const frame = useRef<number | null>(null);
  const renderKey = chapters
    .map((chapter) => `${chapter.bookId}/${chapter.chapter}`)
    .join(',');
  const sourceKey = displayedQueries
    .map((query) => `${query.status}/${query.dataUpdatedAt}`)
    .join(',');

  useLayoutEffect(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!content || !viewport || !before || !after) return;
    const elements = [
      ...content.querySelectorAll<HTMLElement>('[data-reader-chapter]'),
    ];
    const updateBuffers = () => {
      if (scrub.current) {
        buffersNeedUpdate.current = true;
        return;
      }
      buffersNeedUpdate.current = false;
      const loaded = elements.filter(
        (element) => element.dataset.readerChapterLoaded === 'true',
      );
      if (loaded.length > 0) {
        const heights = loaded.map(
          (element) => element.getBoundingClientRect().height,
        );
        const height = heights.reduce((total, value) => total + value, 0);
        if (height > 0) averageHeight.current = height / heights.length;
      }
      if (averageHeight.current <= 0)
        averageHeight.current = viewport.clientHeight * 2;
      const visible = initialized.current
        ? getMostVisibleChapter(content, viewport)
        : undefined;
      const top = visible?.getBoundingClientRect().top;
      before.style.height = `${chaptersBefore * averageHeight.current}px`;
      after.style.height = `${chaptersAfter * averageHeight.current}px`;
      if (chaptersAfter === 0) {
        const last = elements.at(-1);
        const remaining = last
          ? content.getBoundingClientRect().bottom -
            last.getBoundingClientRect().top -
            after.getBoundingClientRect().height
          : viewport.clientHeight;
        after.style.minHeight = `${Math.max(0, viewport.clientHeight - remaining)}px`;
      } else {
        after.style.minHeight = '';
      }
      if (visible && top !== undefined) {
        const adjustment = visible.getBoundingClientRect().top - top;
        if (adjustment !== 0) viewport.scrollTop += adjustment;
      }
    };
    updateBuffers();
    if (anchor.current) {
      const element = elements.find(
        (entry) => entry.dataset.readerChapter === anchor.current?.key,
      );
      if (element)
        viewport.scrollTop +=
          element.getBoundingClientRect().top - anchor.current.top;
    }
    if (!initialized.current) {
      const element = elements.find(
        (entry) =>
          entry.dataset.readerChapter === `${active.bookId}/${active.chapter}`,
      );
      if (element?.dataset.readerChapterLoaded === 'true') {
        const bounds = element.getBoundingClientRect();
        viewport.scrollTop +=
          bounds.top +
          bounds.height * (jump.current ?? 0) -
          viewport.getBoundingClientRect().top;
        initialized.current = true;
        jump.current = null;
      }
    }
    anchor.current = null;
    const observer = new ResizeObserver(updateBuffers);
    elements.forEach((element) => observer.observe(element));
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (anchor.current) return;
      if (!initialized.current) {
        const target = elements.find(
          (entry) =>
            entry.dataset.readerChapter ===
            `${active.bookId}/${active.chapter}`,
        );
        if (target) {
          anchor.current = {
            key: `${active.bookId}/${active.chapter}`,
            top: target.getBoundingClientRect().top,
          };
        }
        return;
      }
      const visible = getMostVisibleChapter(content, viewport);
      if (visible) {
        anchor.current = {
          key: visible.dataset.readerChapter ?? '',
          top: visible.getBoundingClientRect().top,
        };
      }
    };
  }, [renderKey, sourceKey, chaptersBefore, chaptersAfter, bufferRevision]);

  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (scrub.current) {
        const estimate = getEstimatedLocation();
        if (estimate)
          setScrubLocation((current) =>
            current?.bookId === estimate.bookId &&
            current.chapter === estimate.chapter
              ? current
              : estimate,
          );
        return;
      }
      if (!initialized.current) return;
      const visible = getMostVisibleChapter(
        contentRef.current,
        viewportRef.current,
      );
      const chapter = chapters.find(
        (entry) =>
          visible?.dataset.readerChapter === `${entry.bookId}/${entry.chapter}`,
      );
      if (chapter && visible) {
        anchor.current = {
          key: `${chapter.bookId}/${chapter.chapter}`,
          top: visible.getBoundingClientRect().top,
        };
        setActive((current) =>
          current.bookId === chapter.bookId &&
          current.chapter === chapter.chapter
            ? current
            : chapter,
        );
      } else {
        const viewport = viewportRef.current;
        if (!viewport || averageHeight.current <= 0) return;
        const viewportTop = viewport.getBoundingClientRect().top;
        const before = beforeRef.current?.getBoundingClientRect();
        const after = afterRef.current?.getBoundingClientRect();
        let index: number;
        let progress: number;
        if (
          before &&
          viewportTop >= before.top &&
          viewportTop < before.bottom
        ) {
          const offset = (viewportTop - before.top) / averageHeight.current;
          index = Math.floor(offset);
          progress = offset - index;
        } else if (
          after &&
          viewportTop >= after.top &&
          viewportTop < after.bottom
        ) {
          const offset = (viewportTop - after.top) / averageHeight.current;
          index = chaptersBefore + chapters.length + Math.floor(offset);
          progress = offset - Math.floor(offset);
        } else return;
        const target = getChapterAtIndex(manifest, index);
        if (!target) return;
        anchor.current = null;
        initialized.current = false;
        jump.current = progress;
        setActive(target);
      }
    });
  };

  function getEstimatedLocation(): BibleLocation | undefined {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport || averageHeight.current <= 0) return undefined;
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    if (viewport.scrollTop <= 0) {
      const first = getChapterAtIndex(manifest, 0);
      return first;
    }
    if (maxScroll > 0 && viewport.scrollTop >= maxScroll - 1) {
      const last = getChapterAtIndex(manifest, totalChapters - 1);
      return last;
    }
    const viewportTop = viewport.getBoundingClientRect().top;
    const before = beforeRef.current?.getBoundingClientRect();
    const after = afterRef.current?.getBoundingClientRect();
    let offset: number;
    let start: number;
    if (before && viewportTop >= before.top && viewportTop < before.bottom) {
      offset = (viewportTop - before.top) / averageHeight.current;
      start = 0;
    } else if (
      after &&
      viewportTop >= after.top &&
      viewportTop < after.bottom
    ) {
      offset = (viewportTop - after.top) / averageHeight.current;
      start = chaptersBefore + chapters.length;
    } else {
      const visible = getMostVisibleChapter(content, viewport);
      const visibleLocation = chapters.find(
        (chapter) =>
          visible?.dataset.readerChapter ===
          `${chapter.bookId}/${chapter.chapter}`,
      );
      return visibleLocation;
    }
    const index = Math.floor(offset);
    return getChapterAtIndex(manifest, start + index);
  }

  function goTo(chapter: BibleLocation) {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    anchor.current = null;
    jump.current = null;
    const content = contentRef.current;
    const viewport = viewportRef.current;
    const element = [
      ...(content?.querySelectorAll<HTMLElement>('[data-reader-chapter]') ??
        []),
    ].find(
      (entry) =>
        entry.dataset.readerChapter === `${chapter.bookId}/${chapter.chapter}`,
    );
    if (viewport && element) {
      viewport.scrollTop +=
        element.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top;
      anchor.current = {
        key: `${chapter.bookId}/${chapter.chapter}`,
        top: element.getBoundingClientRect().top,
      };
    } else {
      initialized.current = false;
    }
    setActive((current) =>
      current.bookId === chapter.bookId && current.chapter === chapter.chapter
        ? current
        : chapter,
    );
  }

  return {
    active,
    chapters,
    viewportRef,
    contentRef,
    beforeRef,
    afterRef,
    onScroll,
    scrubLocation,
    startScrubbing(pointerId: number) {
      if (scrub.current) return;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      scrub.current = { pointerId, queries };
      setScrubLocation(getEstimatedLocation() ?? active);
    },
    finishScrubbing(pointerId: number) {
      if (scrub.current?.pointerId !== pointerId) return;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      const estimate = getEstimatedLocation();
      scrub.current = null;
      setScrubLocation(null);
      if (buffersNeedUpdate.current)
        setBufferRevision((revision) => revision + 1);
      if (estimate) goTo(estimate);
    },
    getVisibleLocation() {
      const visible = getMostVisibleChapter(
        contentRef.current,
        viewportRef.current,
      );
      return (
        chapters.find(
          (chapter) =>
            visible?.dataset.readerChapter ===
            `${chapter.bookId}/${chapter.chapter}`,
        ) ?? active
      );
    },
    ensureActiveVisible() {
      if (scrub.current) return;
      const content = contentRef.current;
      const viewport = viewportRef.current;
      const element = [
        ...(content?.querySelectorAll<HTMLElement>('[data-reader-chapter]') ??
          []),
      ].find(
        (entry) =>
          entry.dataset.readerChapter === `${active.bookId}/${active.chapter}`,
      );
      if (!viewport || !element) return;
      const bounds = viewport.getBoundingClientRect();
      const chapterBounds = element.getBoundingClientRect();
      if (
        chapterBounds.bottom <= bounds.top ||
        chapterBounds.top >= bounds.bottom
      )
        goTo(active);
    },
    goTo,
    getSource(bookId: string): UseQueryResult<string, Error> {
      return displayedQueries[bookIds.indexOf(bookId)];
    },
  };
}

function getChapterAtIndex(manifest: TranslationManifest, index: number) {
  for (const book of manifest.books) {
    if (index < book.chapters) return { bookId: book.id, chapter: index + 1 };
    index -= book.chapters;
  }
  return undefined;
}

function getMostVisibleChapter(
  content: HTMLDivElement | null,
  viewport: HTMLDivElement | null,
) {
  if (!content || !viewport) return undefined;
  const bounds = viewport.getBoundingClientRect();
  let mostVisible = 0;
  let result: HTMLElement | undefined;
  content
    .querySelectorAll<HTMLElement>('[data-reader-chapter]')
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      const visible = Math.max(
        0,
        Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top),
      );
      if (visible > mostVisible) {
        mostVisible = visible;
        result = element;
      }
    });
  return result;
}
