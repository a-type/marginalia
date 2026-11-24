import {
  bibleSearchBookFilters,
  isBibleSearchBookFilter,
  type BibleSearchBookFilter,
} from '#/lib/bible/search';
import { m } from '#/paraglide/messages';
import { Select, type SelectProps, type SelectTriggerProps } from '@a-type/ui';
import cls from './BibleSearchBookFilterSelect.module.css';

function getBibleSearchBookFilterLabel(filter: BibleSearchBookFilter) {
  switch (filter) {
    case 'hebrew-bible':
      return m.bible_search_hebrew_bible();
    case 'new-testament':
      return m.bible_search_new_testament();
    case 'gospels':
      return m.bible_search_gospels();
    case 'epistles':
      return m.bible_search_epistles();
  }
}

export function BibleSearchBookFilterSelect({
  value,
  books,
  onValueChange,
  size,
  ...props
}: SelectProps & {
  books: Array<{ id: string; title: string }>;
  size?: SelectTriggerProps['size'];
}) {
  return (
    <Select {...props} value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className={cls.bookFilter}
        aria-label={m.bible_search_filter_book()}
        size={size}
      >
        <span>
          {!value || value === 'all'
            ? m.bible_search_all_books()
            : isBibleSearchBookFilter(value)
              ? getBibleSearchBookFilterLabel(value)
              : books.find((book) => book.id === value)?.title}
        </span>
        <Select.Icon />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">{m.bible_search_all_books()}</Select.Item>
        <Select.Group className={cls.selectGroup}>
          <Select.GroupLabel>
            {m.bible_search_group_by_category()}
          </Select.GroupLabel>
          {bibleSearchBookFilters.map((filter) => (
            <Select.Item key={filter} value={filter}>
              {getBibleSearchBookFilterLabel(filter)}
            </Select.Item>
          ))}
        </Select.Group>
        <Select.Group className={cls.selectGroup}>
          <Select.GroupLabel>
            {m.bible_search_group_by_book()}
          </Select.GroupLabel>
          {books.map((book) => (
            <Select.Item key={book.id} value={book.id}>
              {book.title}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select>
  );
}
