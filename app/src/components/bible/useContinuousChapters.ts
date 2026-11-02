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
  const anchor = useRef<{ key: string; top: number } | null>(null);
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
    if (!content || !viewport) return;
    const elements = [
      ...content.querySelectorAll<HTMLElement>('[data-reader-chapter]'),
    ];
    if (!initialized.current) {
      const element = elements.find(
        (entry) =>
          entry.dataset.readerChapter === `${active.bookId}/${active.chapter}`,
      );
      if (element) {
        viewport.scrollTop +=
          element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top;
        initialized.current = true;
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
    return () => {
      if (anchor.current) return;
      const visible = getMostVisibleChapter(content);
      if (visible) {
        anchor.current = {
          key: visible.dataset.readerChapter ?? '',
          top: visible.getBoundingClientRect().top,
        };
      }
    };
  }, [renderKey, sourceKey]);

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
      }
    });
  };

  return {
    active,
    chapters,
    contentRef,
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
