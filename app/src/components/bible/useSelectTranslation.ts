import { useMutation } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { extractVerses } from '../../lib/bible/search';
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
  return useMutation({
    networkMode: 'always',
    mutationFn: async (translation: string) => {
      const next = await fetchTranslationManifest(translation);
      const sameBook = next.books.find((book) => book.id === bookId);
      const book = sameBook ?? next.books[0];
      const nextChapter = sameBook ? Math.min(chapter, book.chapters) : 1;
      const source = await fetchTranslationSource(translation, book);
      const selectedExists = extractVerses(source, book.id).some(
        ({ id }) =>
          id === search.verses && parseVerseId(id).chapter === nextChapter,
      );
      await navigate({
        params: { translation, book: book.id, chapter: String(nextChapter) },
        state: (previous) => ({
          ...previous,
          activeReadingTabId,
          readingPosition: undefined,
        }),
        search:
          selectedExists && book.id === bookId && nextChapter === chapter
            ? { verses: search.verses }
            : {},
      });
      onChange?.({ translation, book: book.id, chapter: nextChapter });
    },
  });
}
