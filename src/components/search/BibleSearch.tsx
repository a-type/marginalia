import { TranslationSelect } from '#/components/bible/TranslationSelect';
import { downloadTranslation } from '#/lib/bible/translation-jobs';
import { parseVerseId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import {
  bibleSearchQueryOptions,
  translationsQueryOptions,
} from '#/queries/translations';
import { ActionButton, Button, Icon, Input, Select } from '@a-type/ui';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import cls from './BibleSearch.module.css';

export function BibleSearch({
  initialTranslation,
  isActive,
  onSelect,
}: {
  initialTranslation: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    translationId,
    bookId,
    rawQuery,
    query,
    page,
    translations,
    record,
    ready,
    results,
    download,
    select,
    shown,
    onTranslationChange,
    onQueryChange,
    onBookChange,
    onSelectVerse,
    previousPage,
    nextPage,
  } = useBibleSearch(initialTranslation, isActive, onSelect);

  useEffect(() => {
    if (isActive)
      rootRef.current
        ?.querySelector<HTMLInputElement>('input[aria-label]')
        ?.focus();
  }, [isActive]);

  return (
    <div className={cls.root} ref={rootRef}>
      <h2 className={cls.heading}>{m.bible_search_title()}</h2>
      <TranslationSelect
        value={translationId}
        installedOnly
        onValueChange={onTranslationChange}
      />
      <Input
        aria-label={m.bible_search_input()}
        placeholder={m.bible_search_input()}
        value={rawQuery}
        className={cls.searchInput}
        onValueChange={onQueryChange}
      />
      {record && (
        <div
          className={cls.actionBar}
          role="group"
          aria-label={m.bible_search_filters()}
        >
          <Select value={bookId} onValueChange={onBookChange}>
            <Select.Trigger
              className={cls.bookFilter}
              aria-label={m.bible_search_filter_book()}
              render={<ActionButton />}
            >
              <span>
                {bookId === 'all'
                  ? m.bible_search_all_books()
                  : record.manifest.books.find((book) => book.id === bookId)
                      ?.title}
              </span>
              <Select.Icon />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">
                {m.bible_search_all_books()}
              </Select.Item>
              {record.manifest.books.map((book) => (
                <Select.Item key={book.id} value={book.id}>
                  {book.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      )}
      {!record && (
        <Button disabled={download.isPending} onClick={() => download.mutate()}>
          <Icon name="download" />
          {m.translation_download()}
        </Button>
      )}
      {record && !ready && (
        <div role="status">
          <p>
            {record.sourceStatus !== 'ready'
              ? m.translation_downloading()
              : record.searchStatus === 'error'
                ? m.translation_search_error()
                : m.translation_preparing()}
          </p>
          <progress
            aria-label={m.translation_preparing()}
            max={record.manifest.books.length}
            value={
              record.sourceStatus === 'ready'
                ? record.prepared
                : record.downloaded
            }
          />
          {(!record.owner || (record.leaseUntil ?? 0) <= Date.now()) && (
            <Button
              onClick={() => download.mutate()}
              disabled={download.isPending}
            >
              <Icon name="refresh" />
              {m.translation_retry()}
            </Button>
          )}
        </div>
      )}
      {results.error && (
        <p role="alert">
          {results.error.message}
          <Button
            emphasis="ghost"
            onClick={() => download.mutate()}
            disabled={download.isPending}
          >
            {m.translation_retry_search()}
          </Button>
        </p>
      )}
      {(download.error || select.error || translations.error) && (
        <p role="alert">
          {download.error?.message ||
            select.error?.message ||
            m.translation_storage_error()}
        </p>
      )}
      <div role="status" aria-live="polite">
        {ready && query.trim() && (results.isFetching || rawQuery !== query)
          ? m.bible_search_loading()
          : shown
            ? shown.total
              ? m.bible_search_count({ count: shown.total })
              : m.bible_search_empty()
            : ''}
      </div>
      <BibleSearchResults
        shown={shown}
        books={record?.manifest.books ?? []}
        isSelecting={select.isPending}
        onSelect={onSelectVerse}
      />
      {shown && shown.total > 50 && (
        <nav className={cls.pagination} aria-label={m.bible_search_title()}>
          <Button
            disabled={page === 0}
            aria-label={m.bible_search_previous()}
            title={m.bible_search_previous()}
            onClick={previousPage}
          >
            <Icon name="arrowLeft" />
          </Button>
          <span>
            {m.bible_search_page({
              page: page + 1,
              pages: Math.ceil(shown.total / 50),
            })}
          </span>
          <Button
            disabled={(page + 1) * 50 >= shown.total}
            aria-label={m.bible_search_next()}
            title={m.bible_search_next()}
            onClick={nextPage}
          >
            <Icon name="arrowRight" />
          </Button>
        </nav>
      )}
    </div>
  );
}

function useBibleSearch(
  initialTranslation: string,
  isActive: boolean,
  onSelect: () => void,
) {
  const [translationId, setTranslationId] = useState(initialTranslation);
  const [bookId, setBookId] = useState('all');
  const [rawQuery, setRawQuery] = useState('');
  const [query] = useDebouncedValue(rawQuery, { wait: 300 });
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!isActive) return;
    setTranslationId(initialTranslation);
    setBookId('all');
    setRawQuery('');
    setPage(0);
  }, [initialTranslation, isActive]);

  const translations = useQuery(translationsQueryOptions);
  const record = translations.data?.find(
    (translation) => translation.id === translationId,
  );
  const ready =
    record?.sourceStatus === 'ready' && record.searchStatus === 'ready';
  const results = useQuery({
    ...bibleSearchQueryOptions(
      translationId,
      query,
      page,
      bookId === 'all' ? undefined : bookId,
    ),
    enabled: ready && Boolean(query.trim()) && rawQuery === query,
  });
  const download = useMutation({
    networkMode: 'always',
    mutationFn: () => downloadTranslation(translationId),
  });
  const navigate = useNavigate();
  const select = useMutation({
    networkMode: 'always',
    mutationFn: async (id: Parameters<typeof parseVerseId>[0]) => {
      const verse = parseVerseId(id);
      await navigate({
        to: '/$translation/$book/$chapter',
        params: {
          translation: translationId,
          book: verse.bookId,
          chapter: String(verse.chapter),
        },
        search: { verses: String(verse.verse) },
      });
      onSelect();
    },
  });
  const shown =
    ready && rawQuery === query && !results.isFetching
      ? results.data
      : undefined;
  const onTranslationChange = (id: string) => {
    setTranslationId(id);
    setBookId('all');
    setPage(0);
  };
  const onQueryChange = (value: string) => {
    setRawQuery(value);
    setPage(0);
  };
  const onBookChange = (value: string | null) => {
    if (!value) return;
    setBookId(value);
    setPage(0);
  };
  return {
    translationId,
    bookId,
    rawQuery,
    query,
    page,
    translations,
    record,
    ready,
    results,
    download,
    select,
    shown,
    onTranslationChange,
    onQueryChange,
    onBookChange,
    onSelectVerse: (id: Parameters<typeof parseVerseId>[0]) =>
      select.mutate(id),
    previousPage: () => setPage(page - 1),
    nextPage: () => setPage(page + 1),
  };
}

function BibleSearchResults({
  shown,
  books,
  isSelecting,
  onSelect,
}: {
  shown: ReturnType<typeof useBibleSearch>['shown'];
  books: NonNullable<
    ReturnType<typeof useBibleSearch>['record']
  >['manifest']['books'];
  isSelecting: boolean;
  onSelect: (id: Parameters<typeof parseVerseId>[0]) => void;
}) {
  return (
    <ol className={cls.results}>
      {shown?.verses.map((verse) => {
        const location = parseVerseId(verse.id);
        const title =
          books.find((book) => book.id === location.bookId)?.title ??
          location.bookId;
        const parts = [];
        let offset = 0;
        for (const [start, end] of verse.ranges) {
          parts.push(
            verse.text.slice(offset, start),
            <mark key={start}>{verse.text.slice(start, end)}</mark>,
          );
          offset = end;
        }
        parts.push(verse.text.slice(offset));
        return (
          <li key={verse.id}>
            <button
              type="button"
              className={cls.result}
              disabled={isSelecting}
              onClick={() => onSelect(verse.id)}
            >
              <strong>
                {title} {location.chapter}:{verse.label}
              </strong>
              <span>{parts}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
