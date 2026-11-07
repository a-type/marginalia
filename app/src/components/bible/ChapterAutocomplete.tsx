import { m } from '#/paraglide/messages';
import { Autocomplete, clsx } from '@a-type/ui';
import cls from './ChapterAutocomplete.module.css';

const AutocompleteRoot = Autocomplete.create<string>();

export function ChapterAutocomplete({
  chapter,
  chapters,
  open,
  onOpenChange,
  query,
  onQueryChange,
  onSelect,
  className,
}: {
  chapter: number;
  chapters: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (chapter: number) => void;
  className?: string;
}) {
  const options = Array.from({ length: chapters }, (_, index) =>
    String(index + 1),
  );

  return (
    <AutocompleteRoot
      items={options}
      filter={(option, value) => option.toString().startsWith(value)}
      modal={false}
      value={open ? query : String(chapter)}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(value, eventDetails) => {
        onQueryChange(value);
        if (eventDetails.reason !== 'item-press') return;
        const nextChapter = Number(value);
        if (
          !Number.isInteger(nextChapter) ||
          nextChapter < 1 ||
          nextChapter > chapters
        )
          return;
        onSelect(nextChapter);
      }}
      autoHighlight
      openOnInputClick
    >
      <AutocompleteRoot.Input
        className={clsx(cls.input, className)}
        type="number"
        min={1}
        max={chapters}
        step={1}
        aria-label={m.bible_chapter_label()}
        disableClear
        disableCaret
        onBlur={() => onOpenChange(false)}
      />
      <AutocompleteRoot.Content
        className={cls.content}
        positioner={{ sideOffset: 8, align: 'start' }}
      >
        <AutocompleteRoot.List>
          {(number) => (
            <AutocompleteRoot.Item
              key={number}
              value={number}
              className={cls.option}
            >
              {number}
            </AutocompleteRoot.Item>
          )}
        </AutocompleteRoot.List>
      </AutocompleteRoot.Content>
    </AutocompleteRoot>
  );
}
