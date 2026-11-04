import { m } from '#/paraglide/messages';
import { getLocale } from '#/paraglide/runtime';
import { Box, Button, Chip, Heading, Icon, P, Text } from '@a-type/ui';
import { Link } from '@tanstack/react-router';
import {
  parseScriptureCitation,
  type BibleReference,
} from '../../lib/bible/location';
import { getMostRecentlyVisitedReadingTab } from '../../lib/bible/reading-tabs';
import { readStoredTranslationId } from '../../lib/bible/source';
import { formatVerseId } from '../../lib/bible/verse';
import { verseHashScrollIntoView } from '../../lib/bible/verse-scroll';
import type {
  LectionaryDay,
  LectionaryReading,
  LectionarySection,
} from '../../lib/lectionary';
import { useAddReadingTab } from '../app/readingTabs';
import { useReferenceSelections } from '../bible/useReferenceSelections';
import cls from './LectionaryReadings.module.css';

export function LectionaryReadings({ day }: { day: LectionaryDay }) {
  return (
    <Box col gap="lg" aria-live="polite">
      {day.sections
        .filter((section) => section.readings.length)
        .map((section) => (
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
            </Text>
            <SectionReadings section={section} />
          </Box>
        ))}
    </Box>
  );
}

function SectionReadings({ section }: { section: LectionarySection }) {
  if (!section.readings.length) {
    return (
      <P role="status" emphasis="ambient" dim>
        {m.lectionary_empty()}
      </P>
    );
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
  const translation =
    getMostRecentlyVisitedReadingTab()?.translationId ??
    readStoredTranslationId();
  const targets = readings.map((reading) =>
    parseScriptureCitation(reading.citation),
  );
  const validTargets = targets.filter(
    (target): target is BibleReference => target !== null,
  );
  const selections = useReferenceSelections(translation, validTargets);
  const openable = validTargets.flatMap((target, index) => {
    const verses = selections[index].verses;
    return verses ? [{ target, verses }] : [];
  });
  let validIndex = 0;
  return (
    <Box col gap>
      <Box gap wrap items="center" render={<ul style={{ margin: 0 }} />}>
        {readings.map((reading, index) => {
          const target = targets[index];
          const selection = target ? selections[validIndex++] : undefined;
          return (
            <Box
              render={<li />}
              col
              gap="xs"
              key={`${reading.citation}-${index}`}
            >
              <ReadingLink
                reading={reading}
                target={target}
                selection={selection}
                translation={translation}
              />
            </Box>
          );
        })}
        <Button
          emphasis="light"
          size="small"
          disabled={
            !openable.length ||
            selections.some((selection) => selection.loading)
          }
          onClick={() => {
            openable.forEach(({ target, verses }, index) => {
              addReadingTab({
                translation,
                book: target.bookId,
                chapter: target.chapter,
                verses,
                activate: index === 0,
              });
            });
          }}
        >
          {m.lectionary_open_all_tabs()}
        </Button>
      </Box>
    </Box>
  );
}

function ReadingLink({
  reading,
  target,
  selection,
  translation,
}: {
  reading: LectionaryReading;
  target: BibleReference | null;
  selection:
    | {
        verses?: string;
        loading: boolean;
        unavailable: boolean;
        retry?: () => unknown;
      }
    | undefined;
  translation: string;
}) {
  const addReadingTab = useAddReadingTab();
  if (!target) {
    return (
      <>
        <Text>{reading.citation}</Text>
        <Text emphasis="secondary">{m.lectionary_unresolved()}</Text>
      </>
    );
  }
  if (!selection?.verses) {
    return (
      <>
        <Text>{reading.citation}</Text>
        <Text
          role={selection?.unavailable ? 'alert' : 'status'}
          emphasis="secondary"
        >
          {selection?.unavailable
            ? m.lexicon_passage_unavailable()
            : m.lexicon_passage_loading()}
        </Text>
        {selection?.retry && (
          <Button size="small" onClick={() => selection.retry?.()}>
            {m.interlinear_retry()}
          </Button>
        )}
      </>
    );
  }
  const verses = selection.verses;
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
              verses,
            });
          }}
          search={{ verses }}
          hash={
            target.verse
              ? `verse-${formatVerseId(target.bookId, target.chapter, target.verse)}`
              : ''
          }
          hashScrollIntoView={verseHashScrollIntoView}
        />
      }
    >
      {reading.citation}
      {reading.isAlternative && (
        <Text emphasis="ambient" dim className={cls.alt}>
          {m.lectionary_alternative()}
        </Text>
      )}
      <Icon name="arrowRight" className={cls.linkIcon} />
    </Chip>
  );
}
