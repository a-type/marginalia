import { m } from '#/paraglide/messages';
import { getLocale } from '#/paraglide/runtime';
import { Box, Button, Chip, Heading, Icon, P, Text } from '@a-type/ui';
import { Link } from '@tanstack/react-router';
import { parseScriptureCitation } from '../../lib/bible/location';
import { getMostRecentlyVisitedReadingTab } from '../../lib/bible/reading-tabs';
import { readStoredTranslationId } from '../../lib/bible/source';
import { formatVerseId } from '../../lib/bible/verse';
import type {
  LectionaryDay,
  LectionaryReading,
  LectionarySection,
} from '../../lib/lectionary';
import { lectionaryTraditions } from '../../lib/lectionary';
import { useAddReadingTab } from '../app/readingTabs';
import cls from './LectionaryReadings.module.css';

export function LectionaryReadings({ day }: { day: LectionaryDay }) {
  return (
    <Box col gap="lg" aria-live="polite">
      {day.sections.map((section) => (
        <Box render={<section />} col gap key={section.kind}>
          <Heading emphasis="ambient" render={<h2 />}>
            {section.kind === 'daily'
              ? m.lectionary_daily_section()
              : section.kind === 'red_letter'
                ? m.lectionary_feast_section()
                : m.lectionary_sunday_section()}
          </Heading>
          <Text emphasis="ambient">
            <time dateTime={section.date}>
              {new Date(`${section.date}T12:00:00`).toLocaleDateString(
                getLocale(),
                { dateStyle: 'long' },
              )}
            </time>
            {' · '}
            {lectionaryTraditions.find((item) => item.id === section.tradition)
              ?.name ?? section.tradition}
          </Text>
          <SectionReadings section={section} />
        </Box>
      ))}
    </Box>
  );
}

function SectionReadings({ section }: { section: LectionarySection }) {
  if (!section.readings.length) {
    return <P role="status">{m.lectionary_empty()}</P>;
  }
  const offices = [
    ...new Set(section.readings.map((reading) => reading.office)),
  ];
  return (
    <Box col gap="lg">
      {offices.map((office) => (
        <Box col key={office}>
          {office && office !== 'sunday' && (
            <Text bold render={<h3 />} emphasis="ambient">
              {office === 'morning'
                ? m.lectionary_morning()
                : office === 'evening'
                  ? m.lectionary_evening()
                  : office}
            </Text>
          )}
          <ReadingGroup
            readings={section.readings.filter(
              (reading) => reading.office === office,
            )}
          />
        </Box>
      ))}
    </Box>
  );
}

function ReadingGroup({ readings }: { readings: LectionaryReading[] }) {
  const addReadingTab = useAddReadingTab();
  const targets = readings.flatMap((reading) => {
    const target = parseScriptureCitation(reading.citation);
    return target ? [target] : [];
  });
  return (
    <Box col gap>
      <Box col gap render={<ul style={{ margin: 0 }} />}>
        {readings.map((reading, index) => (
          <Box
            render={<li />}
            col
            gap="xs"
            key={`${reading.citation}-${index}`}
          >
            <ReadingLink reading={reading} />
            {reading.isAlternative && (
              <Text emphasis="secondary">{m.lectionary_alternative()}</Text>
            )}
          </Box>
        ))}
      </Box>
      <Button
        emphasis="light"
        size="small"
        disabled={!targets.length}
        onClick={() => {
          const translation =
            getMostRecentlyVisitedReadingTab()?.translationId ??
            readStoredTranslationId();
          targets.forEach((target, index) => {
            addReadingTab({
              translation,
              book: target.bookId,
              chapter: target.chapter,
              verses: target.verses,
              activate: index === targets.length - 1,
            });
          });
        }}
      >
        {m.lectionary_open_all_tabs()}
      </Button>
    </Box>
  );
}

function ReadingLink({ reading }: { reading: LectionaryReading }) {
  const addReadingTab = useAddReadingTab();
  const target = parseScriptureCitation(reading.citation);
  const tab = getMostRecentlyVisitedReadingTab();
  const translation = tab?.translationId ?? readStoredTranslationId();
  if (!target) {
    return (
      <>
        <Text>{reading.citation}</Text>
        <Text emphasis="secondary">{m.lectionary_unresolved()}</Text>
      </>
    );
  }
  return (
    <Chip
      className="justify-between"
      render={
        <Link
          to="/$translation/$book/$chapter"
          params={{
            translation,
            book: target.bookId,
            chapter: String(target.chapter),
          }}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            addReadingTab({
              translation,
              book: target.bookId,
              chapter: target.chapter,
              verses: target.verses,
            });
          }}
          search={{ verses: target.verses }}
          hash={
            target.verse
              ? `verse-${formatVerseId(target.bookId, target.chapter, target.verse)}`
              : ''
          }
          hashScrollIntoView={{ block: 'center', behavior: 'instant' }}
        />
      }
    >
      {reading.citation}
      <Icon name="arrowRight" className={cls.linkIcon} />
    </Chip>
  );
}
