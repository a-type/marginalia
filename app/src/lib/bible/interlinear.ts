import { z } from 'zod';
import { AppError } from '../error';
import type { VerseId } from './verse';
import { parseVerseId } from './verse';

const wordSchema = z.object({
  pos: z.number().int().positive(),
  bsbPos: z.number().int().positive(),
  language: z.enum(['hebrew', 'aramaic', 'greek']),
  text: z.string().min(1),
  transliteration: z.string(),
  strongs: z.string().nullable(),
  gloss: z.string().nullable(),
});

const chapterSchema = z.object({
  chapter: z.object({
    number: z.number().int().positive(),
    content: z.array(
      z.object({
        verse: z.number().int().positive(),
        words: z.array(wordSchema),
      }),
    ),
  }),
});

export type InterlinearWord = z.infer<typeof wordSchema>;
export type InterlinearVerse = {
  verse: number;
  words: InterlinearWord[];
};
export type InterlinearChapter = {
  book: string;
  chapter: number;
  verses: InterlinearVerse[];
};

export type InterlinearChapterResult =
  { available: true; chapter: InterlinearChapter } | { available: false };

export type InterlinearSelectionGroup = {
  book: string;
  chapter: number;
  verses: { id: VerseId; verse: number }[];
};

export function groupInterlinearSelection(
  verseIds: readonly VerseId[],
): InterlinearSelectionGroup[] {
  const groups = new Map<string, InterlinearSelectionGroup>();
  for (const id of verseIds) {
    const { bookId, chapter, verse } = parseVerseId(id);
    const key = `${bookId}/${chapter}`;
    let group = groups.get(key);
    if (!group) {
      group = { book: bookId, chapter, verses: [] };
      groups.set(key, group);
    }
    if (!group.verses.some((item) => item.id === id)) {
      group.verses.push({ id, verse });
    }
  }
  return [...groups.values()];
}

export async function fetchInterlinearChapter(
  book: string,
  chapter: number,
  signal?: AbortSignal,
): Promise<InterlinearChapterResult> {
  if (
    !/^[A-Z0-9]{3}$/.test(book) ||
    !Number.isSafeInteger(chapter) ||
    chapter < 1
  ) {
    throw new AppError(AppError.Code.BadRequest, 'Invalid interlinear chapter');
  }

  let response: Response;
  try {
    response = await fetch(
      `https://bible.helloao.org/api/d/bsb-interlinear/${book}/${chapter}.json`,
      { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Unable to reach the interlinear Bible service',
      error,
    );
  }

  if (response.status === 404) return { available: false };
  if (!response.ok) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `Interlinear Bible request failed (${response.status})`,
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Invalid interlinear Bible response',
      error,
    );
  }

  const parsed = chapterSchema.safeParse(value);
  if (!parsed.success || parsed.data.chapter.number !== chapter) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Invalid interlinear Bible chapter data',
      parsed.success ? undefined : parsed.error,
    );
  }

  return {
    available: true,
    chapter: {
      book,
      chapter,
      verses: parsed.data.chapter.content.map(({ verse, words }) => ({
        verse,
        words,
      })),
    },
  };
}
