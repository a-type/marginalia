import { m } from '#/paraglide/messages';
import type {
  FetchBibleTranslation,
  TranslationMetadata,
} from '../../lib/bible/fetch-bible';
import type { StoredTranslation } from '../../lib/bible/translations';

export function bytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function requestPersistence() {
  const storage = (navigator as Partial<Navigator>).storage;
  if (storage && typeof storage.persist === 'function') {
    void storage.persist().catch(() => false);
  }
}

export type TranslationSource =
  | { id: string; title: string; metadata?: TranslationMetadata }
  | FetchBibleTranslation
  | StoredTranslation;

export function toFetchBibleTranslation(
  source: TranslationSource,
  record?: StoredTranslation,
): FetchBibleTranslation {
  const manifest = 'manifest' in source ? source.manifest : undefined;
  const metadata =
    manifest?.metadata ??
    ('metadata' in source ? source.metadata : undefined) ??
    ('attribution' in source ? source : undefined);
  const catalogEntry = 'englishTitle' in source ? source : undefined;
  const title =
    manifest?.title ?? ('title' in source ? source.title : source.id);
  return {
    id: source.id,
    title,
    englishTitle: catalogEntry?.englishTitle ?? title,
    abbreviation: catalogEntry?.abbreviation ?? '',
    localAbbreviation: catalogEntry?.localAbbreviation ?? '',
    year: catalogEntry?.year,
    attribution: metadata?.attribution ?? '',
    attributionUrl: metadata?.attributionUrl,
    licenses: metadata?.licenses ?? [],
    language: record?.language ?? metadata?.language ?? '',
    languageName: catalogEntry?.languageName ?? metadata?.languageName ?? '',
    languageLocalName:
      catalogEntry?.languageLocalName ?? metadata?.languageName ?? '',
    direction: metadata?.direction ?? 'ltr',
  };
}

export function translationStatus(record?: StoredTranslation) {
  if (!record) return m.translation_not_downloaded();
  if (record.sourceStatus === 'ready') return m.translation_downloaded();
  if (record.sourceStatus === 'paused') return m.translation_paused();
  if (record.sourceStatus === 'error') return m.translation_error();
  return m.translation_downloading();
}
