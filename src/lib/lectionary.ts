import { z } from 'zod';
import { AppError } from './error';

export const lectionaryTraditions = [
  { id: 'rcl', name: 'Revised Common Lectionary (Sundays and feasts)' },
  { id: 'acna', name: 'ACNA (Sundays and feasts)' },
  { id: 'acna-sec', name: 'ACNA Daily Office (civil calendar)' },
  { id: 'acna-xian', name: 'ACNA Daily Office (liturgical calendar)' },
] as const;

const serviceSchema = z.object({
  date: z.iso.date(),
  lectionary: z.string(),
  services: z.array(
    z.object({
      name: z.string(),
      readings: z.array(z.string().min(1)),
    }),
  ),
});

const dailySchema = z.object({
  date: z.iso.date(),
  lectionary: z.string(),
  readings: z.object({
    morning: z.record(z.string(), z.string()),
    evening: z.record(z.string(), z.string()),
  }),
});

const responseSchema = z.object({
  red_letter: serviceSchema,
  daily: dailySchema,
  sunday: serviceSchema,
});

export interface LectionaryDay {
  date: string;
  sections: LectionarySection[];
}

export interface LectionarySection {
  kind: 'daily' | 'red_letter' | 'sunday';
  date: string;
  tradition: string;
  readings: LectionaryReading[];
}

export interface LectionaryReading {
  citation: string;
  office: string;
  isAlternative: boolean;
}

export function formatLectionaryDate(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function citationReadings(
  citation: string,
  office: string,
): LectionaryReading[] {
  return citation.split(/\s+or\s+/i).map((text, index) => ({
    citation: text.trim(),
    office,
    isAlternative: index > 0,
  }));
}

export async function fetchLectionaryReadings(
  date: string,
  tradition: string,
  signal?: AbortSignal,
): Promise<LectionaryDay> {
  if (
    !z.iso.date().safeParse(date).success ||
    !lectionaryTraditions.some((item) => item.id === tradition)
  ) {
    throw new AppError(
      AppError.Code.BadRequest,
      'Invalid lectionary date or tradition',
    );
  }
  const isDaily = tradition === 'acna-sec' || tradition === 'acna-xian';
  const serviceTradition = isDaily ? 'acna' : tradition;
  const dailyTradition = isDaily ? tradition : 'acna-sec';
  const search = new URLSearchParams({
    lect: serviceTradition,
    dailyLect: dailyTradition,
  });
  const response = await fetch(`/lectserve/date/${date}?${search}`, { signal });
  if (!response.ok) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `LectServe request failed (${response.status})`,
    );
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (
    !parsed.success ||
    parsed.data.red_letter.date !== date ||
    parsed.data.daily.date !== date ||
    parsed.data.sunday.date < date ||
    parsed.data.red_letter.lectionary !== serviceTradition ||
    parsed.data.sunday.lectionary !== serviceTradition ||
    parsed.data.daily.lectionary !== dailyTradition
  ) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      'Invalid lectionary readings from LectServe',
    );
  }
  const { daily, red_letter, sunday } = parsed.data;
  const dailySection: LectionarySection = {
    kind: 'daily',
    date: daily.date,
    tradition: daily.lectionary,
    readings: Object.entries(daily.readings).flatMap(([office, readings]) =>
      Object.entries(readings)
        .sort(([left], [right]) => left.localeCompare(right))
        .filter(([, citation]) => citation.trim())
        .flatMap(([, citation]) => citationReadings(citation, office)),
    ),
  };
  const services = (
    kind: 'red_letter' | 'sunday',
    service: z.infer<typeof serviceSchema>,
  ): LectionarySection => ({
    kind,
    date: service.date,
    tradition: service.lectionary,
    readings: service.services.flatMap((item) =>
      item.readings.flatMap((citation) =>
        citationReadings(citation, item.name),
      ),
    ),
  });
  return {
    date,
    sections: [
      dailySection,
      services('red_letter', red_letter),
      services('sunday', sunday),
    ],
  };
}
