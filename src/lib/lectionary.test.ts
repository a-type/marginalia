import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLectionaryReadings, formatLectionaryDate } from './lectionary';

afterEach(() => vi.unstubAllGlobals());

function payload() {
  return {
    red_letter: {
      date: '2026-10-28',
      day: 'Wednesday',
      date_pretty: '28. October 2026',
      nextSunday: '2026-11-01',
      type: 'noLect',
      services: [
        {
          alt: '',
          readings: [] as string[],
          name: 'Wednesday, October 28, 2026',
        },
      ],
      year: 'A',
      prevSunday: '2026-10-25',
      lectionary: 'rcl',
    },
    daily: {
      week: 'Sunday Closest to October 26',
      date_pretty: '28. October 2026',
      day: 'Wednesday',
      tomorrow: '2026-10-29',
      readings: {
        morning: { first: 'Acts 6:1-7:16', second: 'John 14:15-31' },
        evening: { second: 'Mark 9:1-29', first: 'Isaiah 10' },
      },
      date: '2026-10-28',
      lectionary: 'acna-sec',
      yesterday: '2026-10-27',
    },
    sunday: {
      year: 'A',
      type: 'fixedFeast',
      services: [
        {
          alt: '',
          readings: [
            'Revelation 7:9-17',
            'Psalm 34:1-10, 22',
            '1 John 3:1-3',
            'Matthew 5:1-12',
          ],
          name: 'All Saints',
        },
      ],
      nextSunday: '2026-11-08',
      date_pretty: '1. November 2026',
      day: 'Sunday',
      date: '2026-11-01',
      lectionary: 'rcl',
      prevSunday: '2026-10-25',
    },
  };
}

function mockResponse(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('LectServe complete response', () => {
  it('formats the local date rather than UTC', () => {
    expect(formatLectionaryDate(new Date(2026, 9, 28, 23, 30))).toBe(
      '2026-10-28',
    );
  });

  it('retains all three sections from the reported response, including an empty feast day', async () => {
    const fetch = mockResponse(payload());
    const signal = new AbortController().signal;
    const day = await fetchLectionaryReadings('2026-10-28', 'rcl', signal);
    expect(fetch).toHaveBeenCalledWith(
      '/lectserve/date/2026-10-28?lect=rcl&dailyLect=acna-sec',
      { signal },
    );
    expect(day).toEqual({
      date: '2026-10-28',
      sections: [
        {
          kind: 'daily',
          date: '2026-10-28',
          tradition: 'acna-sec',
          readings: [
            {
              citation: 'Acts 6:1-7:16',
              office: 'morning',
              isAlternative: false,
            },
            {
              citation: 'John 14:15-31',
              office: 'morning',
              isAlternative: false,
            },
            { citation: 'Isaiah 10', office: 'evening', isAlternative: false },
            {
              citation: 'Mark 9:1-29',
              office: 'evening',
              isAlternative: false,
            },
          ],
        },
        {
          kind: 'red_letter',
          date: '2026-10-28',
          tradition: 'rcl',
          readings: [],
        },
        {
          kind: 'sunday',
          date: '2026-11-01',
          tradition: 'rcl',
          readings: payload().sunday.services[0].readings.map((citation) => ({
            citation,
            office: 'All Saints',
            isAlternative: false,
          })),
        },
      ],
    });
  });

  it.each(['rcl', 'acna', 'acna-sec', 'acna-xian'])(
    'requests both calendars explicitly for %s',
    async (tradition) => {
      const body = payload();
      const daily = tradition.startsWith('acna-');
      const serviceTradition = daily ? 'acna' : tradition;
      body.red_letter.lectionary = serviceTradition;
      body.sunday.lectionary = serviceTradition;
      body.daily.lectionary = daily ? tradition : 'acna-sec';
      const fetch = mockResponse(body);
      const day = await fetchLectionaryReadings('2026-10-28', tradition);
      expect(day.sections).toHaveLength(3);
      expect(fetch).toHaveBeenCalledWith(
        `/lectserve/date/2026-10-28?lect=${serviceTradition}&dailyLect=${body.daily.lectionary}`,
        { signal: undefined },
      );
    },
  );

  it('retains all feast services and separates alternative citations', async () => {
    const body = payload();
    body.red_letter.services = [
      {
        name: 'First service',
        alt: '',
        readings: ['Ecclesiasticus 44:1-14 or Revelation 7:9-17'],
      },
      { name: 'Second service', alt: '', readings: ['John 15:17-27'] },
    ];
    mockResponse(body);
    const day = await fetchLectionaryReadings('2026-10-28', 'rcl');
    expect(day.sections[1].readings).toEqual([
      {
        citation: 'Ecclesiasticus 44:1-14',
        office: 'First service',
        isAlternative: false,
      },
      {
        citation: 'Revelation 7:9-17',
        office: 'First service',
        isAlternative: true,
      },
      {
        citation: 'John 15:17-27',
        office: 'Second service',
        isAlternative: false,
      },
    ]);
  });

  it.each(['daily', 'red_letter', 'sunday'] as const)(
    'rejects missing %s instead of silently discarding data',
    async (section) => {
      const body: Partial<ReturnType<typeof payload>> = payload();
      delete body[section];
      mockResponse(body);
      await expect(
        fetchLectionaryReadings('2026-10-28', 'rcl'),
      ).rejects.toMatchObject({ code: 50200 });
    },
  );

  it.each([
    ['daily', 'date', '2026-10-27'],
    ['red_letter', 'date', '2026-10-27'],
    ['sunday', 'date', '2026-10-27'],
    ['daily', 'lectionary', 'acna-xian'],
    ['red_letter', 'lectionary', 'acna'],
    ['sunday', 'lectionary', 'acna'],
  ] as const)('rejects mismatched %s %s', async (section, field, value) => {
    const body = payload();
    body[section][field] = value;
    mockResponse(body);
    await expect(
      fetchLectionaryReadings('2026-10-28', 'rcl'),
    ).rejects.toMatchObject({ code: 50200 });
  });

  it.each([404, 429, 500, 503])('surfaces HTTP %s failures', async (status) => {
    mockResponse({}, status);
    await expect(
      fetchLectionaryReadings('2026-10-28', 'rcl'),
    ).rejects.toMatchObject({ code: 50200 });
  });

  it.each([
    ['2026-02-30', 'rcl'],
    ['2026-10-28', 'rc'],
  ])('rejects invalid input %s / %s', async (date, tradition) => {
    const fetch = mockResponse({});
    await expect(
      fetchLectionaryReadings(date, tradition),
    ).rejects.toMatchObject({ code: 40000 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
