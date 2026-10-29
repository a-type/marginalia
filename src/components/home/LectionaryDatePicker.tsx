import { m } from '#/paraglide/messages';
import { getLocale } from '#/paraglide/runtime';
import { Box, Button, DatePicker, Icon, Popover } from '@a-type/ui';
import { useState } from 'react';

export function LectionaryDatePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = value.toLocaleDateString(getLocale(), {
    dateStyle: 'long',
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={<Button />}
        aria-label={`${m.lectionary_date()}: ${label}`}
      >
        {label}
      </Popover.Trigger>
      <Popover.Content aria-label={m.lectionary_date()}>
        <LectionaryCalendar
          value={value}
          onChange={(date) => {
            if (!date) return;
            onChange(date);
            setOpen(false);
          }}
        />
      </Popover.Content>
    </Popover>
  );
}

function LectionaryCalendar({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date | null) => void;
}) {
  const [display, setDisplay] = useState(() => ({
    month: value.getMonth(),
    year: value.getFullYear(),
  }));
  const monthLabel = new Date(display.year, display.month).toLocaleDateString(
    getLocale(),
    { month: 'long', year: 'numeric' },
  );
  const changeMonth = (offset: number) => {
    const next = new Date(display.year, display.month + offset);
    setDisplay({ month: next.getMonth(), year: next.getFullYear() });
  };
  return (
    <Box col>
      <DatePicker.Calendar
        displayMonth={display.month}
        displayYear={display.year}
        onDisplayChange={setDisplay}
        value={value}
        onChange={onChange}
      >
        <DatePicker.MonthRow>
          <DatePicker.MonthButton
            emphasis="ghost"
            aria-label={m.lectionary_previous_month()}
            onClick={() => changeMonth(-1)}
          >
            <Icon name="arrowLeft" />
          </DatePicker.MonthButton>
          <DatePicker.MonthLabel aria-live="polite">
            {monthLabel}
          </DatePicker.MonthLabel>
          <DatePicker.MonthButton
            emphasis="ghost"
            aria-label={m.lectionary_next_month()}
            onClick={() => changeMonth(1)}
          >
            <Icon name="arrowRight" />
          </DatePicker.MonthButton>
        </DatePicker.MonthRow>
        <DatePicker.CalendarGrid>
          {(day) => (
            <DatePicker.CalendarDay
              key={day.key}
              value={day}
              aria-label={day.date.toLocaleDateString(getLocale(), {
                dateStyle: 'long',
              })}
            />
          )}
        </DatePicker.CalendarGrid>
      </DatePicker.Calendar>
    </Box>
  );
}
