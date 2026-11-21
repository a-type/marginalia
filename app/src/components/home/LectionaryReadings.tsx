import { m } from '#/paraglide/messages';
import { Box, Button, Chip, Heading, Icon, Text, Tooltip } from '@a-type/ui';
import { Link } from '@tanstack/react-router';
import {
  parseScriptureCitation,
  type BibleReference,
} from '../../lib/bible/location';
import { translationShortCode } from '../../lib/bible/manifests';
import { getMostRecentlyVisitedReadingTab } from '../../lib/bible/reading-tabs';
import { readStoredTranslationId } from '../../lib/bible/source';
import { formatVerseId } from '../../lib/bible/verse';
import { verseHashScrollIntoView } from '../../lib/bible/verse-scroll';
import type {
  LectionaryDay,
  LectionaryReading,
  LectionaryReadingType,
  LectionarySection,
} from '../../lib/lectionary';
import { useAddReadingTab } from '../app/readingTabs';
import { useCompatibleTranslations } from '../bible/useCompatibleTranslations';
import { useReferenceSelections } from '../bible/useReferenceSelections';
import cls from './LectionaryReadings.module.css';

export function LectionaryReadings({
  day,
  readingTypes,
}: {
  day: LectionaryDay;
  readingTypes: readonly LectionaryReadingType[];
}) {
  const sections = day.sections.filter(
    (section) =>
      readingTypes.includes(section.kind) && section.readings.length > 0,
  );
  const daily = sections.find((section) => section.kind === 'daily');
  const sunday = sections.find((section) => section.kind === 'sunday');
  const dailyMatchesSunday =
    daily !== undefined && sunday !== undefined && sameReadings(daily, sunday);

  return (
    <Box col gap="lg" aria-live="polite">
      {sections
        .filter((section) => !(section.kind === 'daily' && dailyMatchesSunday))
        .map((section) => (
          <Box render={<section />} col gap key={section.kind}>
            <Heading emphasis="ambient" className="@mode-dense" render={<h2 />}>
              {section.kind === 'daily'
                ? m.lectionary_daily_section()
                : section.kind === 'red_letter'
                  ? m.lectionary_feast_section()
                  : m.lectionary_sunday_section()}
            </Heading>
            <SectionReadings section={section} />
          </Box>
        ))}
    </Box>
  );
}

function sameReadings(
  left: LectionarySection,
  right: LectionarySection,
): boolean {
  const sortReadings = (section: LectionarySection) =>
    section.readings
      .map(({ citation, isAlternative }) => ({ citation, isAlternative }))
      .sort(
        (a, b) =>
          a.citation.localeCompare(b.citation) ||
          Number(a.isAlternative) - Number(b.isAlternative),
      );
  const leftReadings = sortReadings(left);
  const rightReadings = sortReadings(right);
  return (
    leftReadings.length === rightReadings.length &&
    leftReadings.every(
      (reading, index) =>
        reading.citation === rightReadings[index].citation &&
        reading.isAlternative === rightReadings[index].isAlternative,
    )
  );
}

function SectionReadings({ section }: { section: LectionarySection }) {
  const offices = [
    ...new Set(section.readings.map((reading) => reading.office)),
  ];
  const isDaily = section.kind === 'daily';

  return (
    <Box col gap="lg">
      {offices.map((office) => {
        const dailyOffice =
          isDaily && (office === 'morning' || office === 'evening')
            ? office
            : undefined;
        return (
          <Box col key={office}>
            {!dailyOffice && office && office !== 'sunday' && (
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
              dailyOffice={dailyOffice}
            />
          </Box>
        );
      })}
    </Box>
  );
}

function ReadingGroup({
  readings,
  dailyOffice,
}: {
  readings: LectionaryReading[];
  dailyOffice?: 'morning' | 'evening';
}) {
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
  const compatible = useCompatibleTranslations(translation, [
    ...new Set(validTargets.map(({ bookId }) => bookId)),
  ]);
  const translationFor = (target: BibleReference) =>
    compatible.resolved.get(target.bookId) ?? null;
  const rawSelections = useReferenceSelections(translationFor, validTargets);
  const selections = rawSelections.map((selection) => ({
    ...selection,
    loading: selection.loading || compatible.loading,
    unavailable: !compatible.loading && selection.unavailable,
  }));
  const openable = validTargets.flatMap((target, index) => {
    const verses = selections[index].verses;
    const id = translationFor(target);
    return verses && id ? [{ target, verses, translation: id }] : [];
  });
  let validIndex = 0;
  return (
    <Box col gap>
      <Box gap wrap items="center" render={<ul style={{ margin: 0 }} />}>
        {dailyOffice && (
          <Box render={<li />} gap="xs" items="center" key="office-label">
            <Icon name={dailyOffice === 'morning' ? 'sun' : 'moon'} />
            <Text bold emphasis="ambient" render={<span />}>
              {dailyOffice === 'morning'
                ? m.lectionary_morning_short()
                : m.lectionary_evening_short()}
            </Text>
          </Box>
        )}
        {readings.map((reading, index) => {
          const target = targets[index];
          const selection = target ? selections[validIndex++] : undefined;
          return (
            <Box
              render={<li />}
              col={!dailyOffice}
              items={dailyOffice ? 'center' : undefined}
              gap="xs"
              key={`${reading.citation}-${index}`}
            >
              <ReadingLink
                reading={reading}
                target={target}
                selection={selection}
                translation={target ? translationFor(target) : null}
                currentTranslation={translation}
              />
            </Box>
          );
        })}
        <Box render={<li />}>
          <Button
            emphasis="light"
            size="small"
            disabled={
              !openable.length ||
              selections.some((selection) => selection.loading)
            }
            onClick={() => {
              openable.forEach(({ target, verses, translation }, index) => {
                addReadingTab({
                  translation,
                  book: target.bookId,
                  chapter: target.chapter,
                  pericope: verses,
                  activate: index === 0,
                });
              });
            }}
          >
            {m.lectionary_open_all_tabs()}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function ReadingLink({
  reading,
  target,
  selection,
  translation,
  currentTranslation,
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
  translation: string | null;
  currentTranslation: string;
}) {
  const addReadingTab = useAddReadingTab();
  if (!target) {
    return (
      <Text>
        {reading.citation}
        <Tooltip content={m.lectionary_unresolved()}>
          <Button
            size="small"
            emphasis="ghost"
            aria-label={m.lectionary_unresolved()}
          >
            <Icon name="info" />
          </Button>
        </Tooltip>
      </Text>
    );
  }
  if (!translation || !selection) {
    return (
      <Tooltip content={m.lexicon_passage_unavailable()}>
        <Chip aria-disabled="true">{reading.citation}</Chip>
      </Tooltip>
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
              pericope: verses,
            });
          }}
          search={{ pericope: verses }}
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
      {translation !== currentTranslation &&
        ` (${translationShortCode(translation)})`}
      {reading.isAlternative && (
        <Text emphasis="ambient" dim className={cls.alt}>
          {m.lectionary_alternative()}
        </Text>
      )}
      <Icon name="arrowRight" className={cls.linkIcon} />
    </Chip>
  );
}
