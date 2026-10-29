import {
  fetchTranslationManifest,
  fetchTranslationSource,
} from '#/lib/bible/source';
import { parseVerseLabel } from '#/lib/bible/verse';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
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
      let selectedExists = false;
      let sourceChapter = 0;
      for (const match of source.matchAll(/^\\(c|v)\s+(\S+)/gm)) {
        if (match[1] === 'c') sourceChapter = Number(match[2]);
        else if (
          sourceChapter === nextChapter &&
          String(parseVerseLabel(match[2])) === search.verses
        )
          selectedExists = true;
      }
      await navigate({
        params: { translation, book: book.id, chapter: String(nextChapter) },
        state: (previous) => ({ ...previous, activeReadingTabId }),
        search:
          selectedExists && book.id === bookId && nextChapter === chapter
            ? { verses: search.verses }
            : {},
      });
      onChange?.({ translation, book: book.id, chapter: nextChapter });
    },
  });
}
