import { m } from '#/paraglide/messages';
import { Button } from '@a-type/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import type { BibleLocation } from '../../lib/bible/location';
import { builtinTranslations } from '../../lib/bible/manifests';
import {
  getTranslationBook,
  hasTranslationChapter,
} from '../../lib/bible/source';
import {
  fetchBibleCatalogQueryOptions,
  readerManifestQueryOptions,
  translationsQueryOptions,
} from '../../queries/translations';

export function TranslationAlternatives({
  translationId,
  location,
}: {
  translationId: string;
  location: BibleLocation;
}) {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { data: manifest } = useQuery(
    readerManifestQueryOptions(translationId),
  );
  const unavailable =
    manifest &&
    !hasTranslationChapter(
      getTranslationBook(manifest, location.bookId),
      location.chapter,
    );
  const language = unavailable ? manifest.metadata?.language : undefined;
  const catalog = useQuery({
    ...fetchBibleCatalogQueryOptions,
    enabled: Boolean(language),
  });
  const installed = useQuery(translationsQueryOptions);
  const candidates = [
    ...new Map(
      [
        ...builtinTranslations.map((entry) => ({
          id: entry.id,
          language: entry.metadata.language,
        })),
        ...(catalog.data ?? []),
        ...(installed.data ?? []).filter(
          (entry) => entry.sourceStatus === 'ready',
        ),
      ].map((entry) => [entry.id, entry]),
    ).values(),
  ].filter(
    (entry) =>
      language && entry.language === language && entry.id !== translationId,
  );
  const alternatives = useQueries({
    queries: candidates.map((entry) => ({
      ...readerManifestQueryOptions(entry.id),
      retry: false,
    })),
  });
  const available = alternatives.flatMap(({ data }) =>
    data &&
    hasTranslationChapter(
      getTranslationBook(data, location.bookId),
      location.chapter,
    )
      ? [data]
      : [],
  );
  if (!available.length) return null;

  return (
    <div>
      <p>{m.bible_recovery_translations()}</p>
      <ul>
        {available.map((entry) => (
          <li key={entry.id}>
            <Button
              onClick={() =>
                void navigate({
                  to: '/$translation/$book/$chapter',
                  params: {
                    translation: entry.id,
                    book: location.bookId,
                    chapter: String(location.chapter),
                  },
                  search: routeLocation.search,
                  hash: routeLocation.hash,
                  state: routeLocation.state,
                  replace: true,
                })
              }
            >
              {entry.title}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
