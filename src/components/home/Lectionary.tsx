import { formatLectionaryDate, lectionaryTraditions } from '#/lib/lectionary';
import { m } from '#/paraglide/messages';
import { lectionaryReadingsQueryOptions } from '#/queries/lectionary';
import { Box, Button, Heading, P, Select, TextLink } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LectionaryDatePicker } from './LectionaryDatePicker';
import { LectionaryReadings } from './LectionaryReadings';

export function Lectionary() {
  const [date, setDate] = useState(() => new Date());
  const [selectedTradition, setSelectedTradition] = useState('rcl');
  const tradition =
    lectionaryTraditions.find((item) => item.id === selectedTradition) ??
    lectionaryTraditions[0];
  const readings = useQuery(
    lectionaryReadingsQueryOptions(formatLectionaryDate(date), tradition.id),
  );

  return (
    <Box p col gap="lg" overflow="auto-y">
      <Heading render={<h1 />}>{m.lectionary_title()}</Heading>
      <Box gap wrap items="center">
        <Select
          value={tradition.id}
          onValueChange={(value) => {
            if (value) setSelectedTradition(value);
          }}
          itemToStringLabel={(id) =>
            lectionaryTraditions.find((item) => item.id === id)?.name ?? id
          }
        >
          <Select.Trigger aria-label={m.lectionary_tradition()}>
            <span>{tradition.name}</span>
            <Select.Icon />
          </Select.Trigger>
          <Select.Content>
            {lectionaryTraditions.map((item) => (
              <Select.Item key={item.id} value={item.id}>
                {item.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <LectionaryDatePicker value={date} onChange={setDate} />
        <Button emphasis="ghost" onClick={() => setDate(new Date())}>
          {m.lectionary_today()}
        </Button>
      </Box>
      {readings.isPending ? (
        <P role="status">{m.lectionary_loading()}</P>
      ) : readings.isError ? (
        <Box col gap role="alert">
          <P>{m.lectionary_error()}</P>
          <Button
            onClick={() => {
              void readings.refetch();
            }}
          >
            {m.lectionary_retry()}
          </Button>
        </Box>
      ) : (
        <LectionaryReadings day={readings.data} />
      )}
      <TextLink emphasis="ambient" href="https://www.lectserve.com/html/about">
        {m.lectionary_attribution()}
      </TextLink>
    </Box>
  );
}
