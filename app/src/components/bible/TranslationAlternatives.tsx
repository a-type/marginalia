import { m } from '#/paraglide/messages';
import { Button } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import type { BibleLocation } from '../../lib/bible/location';
import {
  getTranslationBook,
  hasTranslationChapter,
} from '../../lib/bible/source';
import { readerManifestQueryOptions } from '../../queries/translations';
import { useAlternativeManifests } from './useCompatibleTranslations';

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
  const { manifests } = useAlternativeManifests(
    translationId,
    language,
  );
  const available = manifests.filter((entry) =>
    hasTranslationChapter(
      getTranslationBook(entry, location.bookId),
      location.chapter,
    ),
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
