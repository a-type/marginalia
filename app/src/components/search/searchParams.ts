import { redirect } from '@tanstack/react-router';
import { isTranslationId } from '../../lib/bible/manifests';
import { readStoredTranslationId } from '../../lib/bible/source';
import { isBookId } from '../../lib/bible/verse';

export function validateBibleSearchParams(search: Record<string, unknown>) {
  const query = search.q;
  return {
    q:
      typeof query === 'string'
        ? query || undefined
        : typeof query === 'number' || typeof query === 'boolean'
          ? String(query)
          : undefined,
    translation:
      typeof search.translation === 'string' &&
      isTranslationId(search.translation)
        ? search.translation
        : undefined,
    book:
      typeof search.book === 'string' && isBookId(search.book)
        ? search.book
        : undefined,
    notes: search.notes === true ? true : undefined,
    highlights: search.highlights === true ? true : undefined,
    order: search.order === 'oldest' ? ('oldest' as const) : undefined,
    page:
      typeof search.page === 'number' &&
      Number.isSafeInteger(search.page) &&
      search.page > 1
        ? search.page
        : undefined,
  };
}

export function ensureSearchTranslation(
  search: ReturnType<typeof validateBibleSearchParams>,
) {
  if (!search.translation) {
    throw redirect({
      to: '/search',
      search: { ...search, translation: readStoredTranslationId() },
      replace: true,
    });
  }
}
