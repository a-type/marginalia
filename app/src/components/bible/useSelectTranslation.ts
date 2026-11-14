import { useMutation } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { extractVerses } from '../../lib/bible/search';
import { parseVerseSelection } from '../../lib/bible/selection';
import { readReadingTabsState } from '../../lib/bible/reading-tabs';
import {
  fetchTranslationManifest,
  fetchTranslationSource,
} from '../../lib/bible/source';
import { parseVerseId } from '../../lib/bible/verse';
import { readerRoute } from '../annotations/AnnotationPane';

export function useSelectTranslation({
  onChange,
  bookId,
  chapter,
}: {
  bookId: string;
  chapter: number;
  onChange?: (info: {
    translation: string;
    book: string;
    chapter: number;
  }) => void;
}) {
  const search = readerRoute.useSearch();
  const navigate = readerRoute.useNavigate();
  const activeReadingTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  const translationScrollPosition = useLocation({
    select: (routeLocation) => routeLocation.state.translationScrollPosition,
  });
  const currentTranslationId = readerRoute.useParams({
    select: (params) => params.translation,
  });
  return useMutation({
    networkMode: 'always',
    mutationFn: async (translation: string) => {
      const next = await fetchTranslationManifest(translation);
      const sameBook = next.books.find((book) => book.id === bookId);
      const book = sameBook ?? next.books[0];
      const nextChapter = sameBook ? Math.min(chapter, book.chapters) : 1;
      const source = await fetchTranslationSource(translation, book);
      const ranges = parseVerseSelection(search.verses);
      const verseIds = new Set(
        extractVerses(source, book.id).map(({ id }) => id),
      );
      const endpointBookIds = new Set(
        ranges.flatMap(({ start, end }) => [
          parseVerseId(start).bookId,
          parseVerseId(end).bookId,
        ]),
      );
      for (const endpointBookId of endpointBookIds) {
        if (endpointBookId === book.id) continue;
        const endpointBook = next.books.find(
          (entry) => entry.id === endpointBookId,
        );
        if (!endpointBook) continue;
        const endpointSource = await fetchTranslationSource(
          translation,
          endpointBook,
        );
        extractVerses(endpointSource, endpointBook.id).forEach(({ id }) =>
          verseIds.add(id),
        );
      }
      const selectedExists =
        book.id === bookId &&
        nextChapter === chapter &&
        ranges.length > 0 &&
        ranges.every(
          ({ start, end }) => verseIds.has(start) && verseIds.has(end),
        );
      const readingTab = readReadingTabsState().tabs.find(
        (tab) =>
          tab.id === activeReadingTabId &&
          tab.translationId === currentTranslationId,
      );
      const savedTranslationPosition =
        readingTab?.position || readingTab?.scrollProgress !== undefined
          ? {
              translationId: translation,
              location: { bookId: book.id, chapter: nextChapter },
              position: readingTab.position ?? { bookId, chapter },
              scrollProgress: readingTab.scrollProgress ?? 0,
            }
          : undefined;
      const previousTranslationPosition =
        translationScrollPosition?.translationId === currentTranslationId &&
        translationScrollPosition.location.bookId === bookId &&
        translationScrollPosition.location.chapter === chapter
          ? translationScrollPosition
          : undefined;
      await navigate({
        params: { translation, book: book.id, chapter: String(nextChapter) },
        state: (previous) => ({
          ...previous,
          activeReadingTabId,
          readingPosition: undefined,
          translationScrollPosition:
            savedTranslationPosition ??
            (previousTranslationPosition
              ? {
                  ...previousTranslationPosition,
                  translationId: translation,
                  location: { bookId: book.id, chapter: nextChapter },
                }
              : undefined),
        }),
        search: selectedExists ? { verses: search.verses } : {},
      });
      onChange?.({ translation, book: book.id, chapter: nextChapter });
    },
  });
}
