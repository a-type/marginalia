import { AppError } from '#/lib/error';
import { z } from 'zod';
import {
  builtinTranslations,
  isTranslationId,
  parseTranslationExtra,
} from './manifests';

export const fetchBibleOrigin = 'https://v1.fetch.bible';

export interface TranslationLicense {
  name: string;
  url: string;
  attributionRequired: boolean;
  shareAlike: boolean;
  noDerivatives: boolean;
}

export interface TranslationMetadata {
  attribution: string;
  attributionUrl?: string;
  licenses: TranslationLicense[];
  language: string;
  languageName: string;
  direction: 'ltr' | 'rtl';
}

export interface FetchBibleTranslation extends TranslationMetadata {
  id: string;
  title: string;
  englishTitle: string;
  abbreviation: string;
  localAbbreviation: string;
  languageLocalName: string;
  year?: number;
}

const restrictionsSchema = z.object({
  forbid_commercial: z.literal(false),
  forbid_limitless: z.literal(false),
  forbid_other: z.literal(false),
  forbid_attributionless: z.boolean(),
  forbid_derivatives: z.union([z.boolean(), z.literal('same-license')]),
});
const urlSchema = z.url().pipe(
  z.string().refine((value) => {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }),
);
const translationSchema = z.object({
  name: z.object({
    local: z.string(),
    english: z.string(),
    local_abbrev: z.string(),
    english_abbrev: z.string(),
  }),
  year: z.number().optional(),
  direction: z.enum(['ltr', 'rtl']),
  copyright: z.object({
    attribution: z.string(),
    attribution_url: z.string().optional(),
    licenses: z
      .array(z.object({ license: z.unknown(), url: urlSchema }))
      .min(1),
  }),
});
const namedLicenses: Record<string, string> = {
  public: 'Public domain',
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
  'cc-by-nd': 'CC BY-ND',
};
const catalogSchema = z.object({
  translations: z.record(z.string(), z.unknown()),
  languages: z.record(
    z.string(),
    z.object({ english: z.string(), local: z.string() }),
  ),
  licenses: z.record(z.string(), z.object({ restrictions: z.unknown() })),
});

export function parseFetchBibleCatalog(
  input: unknown,
): FetchBibleTranslation[] {
  const catalog = catalogSchema.safeParse(input);
  if (!catalog.success)
    throw new AppError(AppError.Code.BadRequest, 'Invalid Fetch Bible catalog');
  const languages = new Map(Object.entries(catalog.data.languages));
  const licenseDefinitions = new Map(Object.entries(catalog.data.licenses));
  return Object.entries(catalog.data.translations)
    .flatMap(([id, value]) => {
      if (!isTranslationId(id) || !/^[a-z]{3}_/.test(id)) return [];
      const parsed = translationSchema.safeParse(value);
      if (!parsed.success) return [];
      const translation = parsed.data;
      const language = id.split('_')[0];
      const languageInfo = languages.get(language);
      if (!languageInfo) return [];
      const licenses: TranslationLicense[] = [];
      for (const entry of translation.copyright.licenses) {
        const named = typeof entry.license === 'string';
        if (named && !Object.hasOwn(namedLicenses, entry.license as string))
          return [];
        const restrictions = restrictionsSchema.safeParse(
          named
            ? licenseDefinitions.get(entry.license as string)?.restrictions
            : entry.license,
        );
        if (!restrictions.success) return [];
        if (
          restrictions.data.forbid_attributionless &&
          !translation.copyright.attribution.trim()
        )
          return [];
        licenses.push({
          name: named
            ? namedLicenses[entry.license as string]
            : new URL(entry.url).hostname,
          url: entry.url,
          attributionRequired: restrictions.data.forbid_attributionless,
          shareAlike: restrictions.data.forbid_derivatives === 'same-license',
          noDerivatives: restrictions.data.forbid_derivatives === true,
        });
      }
      const title =
        translation.name.local.trim() || translation.name.english.trim();
      if (!title) return [];
      return [
        {
          id,
          title,
          englishTitle: translation.name.english,
          abbreviation: translation.name.english_abbrev,
          localAbbreviation: translation.name.local_abbrev,
          language,
          languageName: languageInfo.english,
          languageLocalName: languageInfo.local,
          direction: translation.direction,
          year: translation.year,
          attribution: translation.copyright.attribution,
          attributionUrl: urlSchema.safeParse(
            translation.copyright.attribution_url,
          ).data,
          licenses,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.languageName.localeCompare(right.languageName) ||
        left.title.localeCompare(right.title),
    );
}

export function filterFetchBibleTranslations(
  translations: FetchBibleTranslation[],
  text: string,
  language: string,
) {
  const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return translations.filter((translation) => {
    if (language && translation.language !== language) return false;
    const searchable = [
      translation.id,
      translation.title,
      translation.englishTitle,
      translation.abbreviation,
      translation.localAbbreviation,
      translation.languageName,
      translation.languageLocalName,
    ]
      .join(' ')
      .toLocaleLowerCase();
    return words.every((word) => searchable.includes(word));
  });
}

export async function fetchBibleCatalog(signal?: AbortSignal) {
  const response = await fetch(`${fetchBibleOrigin}/bibles/manifest.json`, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Unable to load Fetch Bible translations',
    );
  return parseFetchBibleCatalog(await response.json());
}

export async function fetchBibleTranslation(id: string, signal?: AbortSignal) {
  if (!isTranslationId(id))
    throw new AppError(AppError.Code.BadRequest, 'Invalid translation ID');
  const translation = (await fetchBibleCatalog(signal)).find(
    (entry) => entry.id === id,
  );
  if (!translation)
    throw new AppError(
      AppError.Code.NotFound,
      'Translation is not licensed for commercial use',
    );
  return translation;
}

export function translationResourceUrl(id: string, filename: string) {
  if (
    !isTranslationId(id) ||
    !/^(?:extra\.json|[a-z0-9]{3}\.usfm)$/.test(filename)
  )
    throw new AppError(
      AppError.Code.BadRequest,
      'Invalid translation resource',
    );
  if (builtinTranslations.some((translation) => translation.id === id))
    return `/usfm/${id}/${filename}`;
  return `${fetchBibleOrigin}/bibles/${id}/${filename === 'extra.json' ? filename : `usfm/${filename}`}`;
}

export async function fetchBibleManifest(id: string, signal?: AbortSignal) {
  const translation = await fetchBibleTranslation(id, signal);
  const response = await fetch(translationResourceUrl(id, 'extra.json'), {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Unable to load translation metadata',
    );
  const {
    attribution,
    attributionUrl,
    licenses,
    language,
    languageName,
    direction,
  } = translation;
  return parseTranslationExtra(await response.json(), id, {
    title: translation.title,
    metadata: {
      attribution,
      attributionUrl,
      licenses,
      language,
      languageName,
      direction,
    },
  });
}
