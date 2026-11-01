import { z } from 'zod';
import { AppError } from '../error';

const senseSchema = z.object({
  id: z.string().min(1),
  lemma: z.string(),
  transliteration: z.string().nullish(),
  partOfSpeech: z.string().nullish(),
  gloss: z.string().nullish(),
  definition: z.string().nullish(),
});

const entrySchema = z.object({
  entry: z.object({
    id: z.string().min(1),
    senses: z.array(senseSchema),
  }),
});

export type LexiconSense = z.infer<typeof senseSchema>;
export type LexiconEntry = { id: string; senses: LexiconSense[] };
export type LexiconEntryResult =
  { available: true; entry: LexiconEntry } | { available: false };

/** Normalizes Strong's numbers to the zero-padded form used by the lexicon (e.g. `H853` → `H0853`). */
export function normalizeStrongsId(value: string): string | null {
  const match = /^([HG])0*(\d{1,4})([A-Za-z]?)$/.exec(
    value.trim().toUpperCase(),
  );
  if (!match || Number(match[2]) === 0) return null;
  return `${match[1]}${match[2].padStart(4, '0')}${match[3]}`;
}

export async function fetchLexiconEntry(
  strongsId: string,
  signal?: AbortSignal,
): Promise<LexiconEntryResult> {
  const id = normalizeStrongsId(strongsId);
  if (!id) {
    throw new AppError(AppError.Code.BadRequest, "Invalid Strong's number");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://bible.helloao.org/api/d/stepbible-lexicon/lexicon/${id}.json`,
      { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Unable to reach the lexicon service',
      error,
    );
  }

  if (response.status === 404) return { available: false };
  if (!response.ok) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `Lexicon request failed (${response.status})`,
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Invalid lexicon response',
      error,
    );
  }

  const parsed = entrySchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Invalid lexicon entry data',
      parsed.error,
    );
  }
  if (parsed.data.entry.senses.length === 0) return { available: false };

  return {
    available: true,
    entry: { id: parsed.data.entry.id, senses: parsed.data.entry.senses },
  };
}
