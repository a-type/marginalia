import { Autocomplete, clsx } from '@a-type/ui';
import { useState } from 'react';

import { m } from '#/paraglide/messages';
import type { TranslationManifest } from '../../lib/bible/source';
import type { BookId } from '../../lib/bible/verse';
import cls from './BookAutocomplete.module.css';

const AutocompleteRoot = Autocomplete.create<string>();

export function BookAutocomplete({
  bookId,
  books,
  onSelect,
  className,
}: {
  bookId: BookId;
  books: TranslationManifest['books'];
  onSelect: (bookId: BookId) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const book = books.find((option) => option.id === bookId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredBooks = normalizedQuery
    ? books.filter(
        (option) =>
          option.title.toLowerCase().includes(normalizedQuery) ||
          option.id.toLowerCase().includes(normalizedQuery),
      )
    : books;

  return (
    <AutocompleteRoot
      items={books.map((option) => option.id)}
      filteredItems={filteredBooks.map((option) => option.id)}
      modal={false}
      value={open ? query : (book?.title ?? bookId)}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(value, eventDetails) => {
        setQuery(value);
        if (eventDetails.reason !== 'item-press') return;
        const nextBook = books.find(
          (option) => option.id === value || option.title === value,
        );
        if (!nextBook) return;
        setQuery('');
        setOpen(false);
        onSelect(nextBook.id);
      }}
      itemToStringValue={(id) =>
        books.find((option) => option.id === id)?.title ?? id
      }
      autoHighlight
      openOnInputClick
    >
      <AutocompleteRoot.Input
        className={clsx(cls.input, className)}
        aria-label={m.bible_book_label()}
        disableClear
        disableCaret
        onBlur={() => setOpen(false)}
      />
      <AutocompleteRoot.Content
        positioner={{ sideOffset: 8, align: 'start' }}
        className={cls.content}
      >
        <AutocompleteRoot.List className={cls.grid}>
          {(id) => {
            const option = books.find((entry) => entry.id === id);
            if (!option) return null;
            return (
              <AutocompleteRoot.Item
                key={option.id}
                value={option.id}
                className={cls.option}
              >
                <span className={cls.title}>{option.title}</span>
              </AutocompleteRoot.Item>
            );
          }}
        </AutocompleteRoot.List>
      </AutocompleteRoot.Content>
    </AutocompleteRoot>
  );
}
