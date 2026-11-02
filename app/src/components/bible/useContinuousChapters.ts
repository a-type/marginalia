import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';

import type { BibleLocation } from '../../lib/bible/location';
import { getAdjacentChapter } from '../../lib/bible/navigation';
import type { TranslationManifest } from '../../lib/bible/source';
import { getTranslationBook } from '../../lib/bible/source';
import { AppError } from '../../lib/error';
import { readerBookSourceQueryOptions } from '../../queries/translations';

type BookSource = { bookId: string; source: string };

const CHAPTER_BUFFER = 2;

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
  const contentRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const averageHeight = useRef(0);
  const anchor = useRef<{ key: string; top: number } | null>(null);
  const jump = useRef<number | null>(null);
  const initialized = useRef(false);
  const frame = useRef<number | null>(null);
  const renderKey = chapters
    .map((chapter) => `${chapter.bookId}/${chapter.chapter}`)
    .join(',');
  const sourceKey = queries
    .map((query) => `${query.status}/${query.dataUpdatedAt}`)
    .join(',');

  useLayoutEffect(() => {
    const content = contentRef.current;
    const viewport = content?.closest<HTMLElement>(
      '[data-scroll-direction="vertical"]',
    );
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!content || !viewport || !before || !after) return;
    const elements = [
      ...content.querySelectorAll<HTMLElement>('[data-reader-chapter]'),
    ];
    const updateBuffers = () => {
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
      const visible = initialized.current
        ? getMostVisibleChapter(content)
        : undefined;
      const top = visible?.getBoundingClientRect().top;
      before.style.height = `${chaptersBefore * averageHeight.current}px`;
      after.style.height = `${chaptersAfter * averageHeight.current}px`;
      if (visible && top !== undefined) {
        const adjustment = visible.getBoundingClientRect().top - top;
        if (adjustment !== 0) viewport.scrollTop += adjustment;
      }
    };
    updateBuffers();
    if (!initialized.current) {
      const element = elements.find(
        (entry) =>
          entry.dataset.readerChapter === `${active.bookId}/${active.chapter}`,
      );
      if (element) {
        const bounds = element.getBoundingClientRect();
        viewport.scrollTop +=
          bounds.top +
          bounds.height * (jump.current ?? 0) -
          viewport.getBoundingClientRect().top;
        initialized.current = true;
        jump.current = null;
      }
    } else if (anchor.current) {
      const element = elements.find(
        (entry) => entry.dataset.readerChapter === anchor.current?.key,
      );
      if (element)
        viewport.scrollTop +=
          element.getBoundingClientRect().top - anchor.current.top;
    }
    anchor.current = null;
    const observer = new ResizeObserver(updateBuffers);
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      if (anchor.current) return;
      const visible = getMostVisibleChapter(content);
      if (visible) {
        anchor.current = {
          key: visible.dataset.readerChapter ?? '',
          top: visible.getBoundingClientRect().top,
        };
      }
    };
  }, [renderKey, sourceKey, chaptersBefore, chaptersAfter]);

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
      const visible = getMostVisibleChapter(contentRef.current);
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
        const content = contentRef.current;
        const viewport = content?.closest<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        );
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

  return {
    active,
    chapters,
    contentRef,
    beforeRef,
    afterRef,
    onScroll,
    getVisibleLocation() {
      const visible = getMostVisibleChapter(contentRef.current);
      return (
        chapters.find(
          (chapter) =>
            visible?.dataset.readerChapter ===
            `${chapter.bookId}/${chapter.chapter}`,
        ) ?? active
      );
    },
    goTo(chapter: BibleLocation) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      anchor.current = null;
      jump.current = null;
      if (
        chapter.bookId === active.bookId &&
        chapter.chapter === active.chapter
      ) {
        const content = contentRef.current;
        const viewport = content?.closest<HTMLElement>(
          '[data-scroll-direction="vertical"]',
        );
        const element = [
          ...(content?.querySelectorAll<HTMLElement>('[data-reader-chapter]') ??
            []),
        ].find(
          (entry) =>
            entry.dataset.readerChapter ===
            `${chapter.bookId}/${chapter.chapter}`,
        );
        if (viewport && element)
          viewport.scrollTop +=
            element.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top;
        return;
      }
      initialized.current = false;
      setActive(chapter);
    },
    getSource(bookId: string): UseQueryResult<string, Error> {
      return queries[bookIds.indexOf(bookId)];
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

function getMostVisibleChapter(content: HTMLDivElement | null) {
  const viewport = content?.closest('[data-scroll-direction="vertical"]');
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
