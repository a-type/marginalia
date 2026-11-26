import { m } from '#/paraglide/messages';
import { Box, Button, Icon, Input } from '@a-type/ui';
import { useEffect, useRef } from 'react';
import type { AnnotationRecord } from '../../lib/annotations/collections';
import type { VerseId } from '../../lib/bible/verse';
import { parseVerseId } from '../../lib/bible/verse';
import cls from './BibleSearch.module.css';
import { BibleSearchAnnotationOrderSelect } from './BibleSearchAnnotationOrderSelect';
import { BibleSearchBookFilterSelect } from './BibleSearchBookFilterSelect';
import { BibleSearchProvider, useBibleSearch } from './BibleSearchContext';
import { BibleSearchHighlightsFilter } from './BibleSearchHighlightsFilter';
import { BibleSearchNotesFilter } from './BibleSearchNotesFilter';
import { BibleSearchTranslationFilter } from './BibleSearchTranslationFilter';

export function BibleSearch({
  initialTranslation,
  isActive,
  onSelect,
}: {
  initialTranslation: string;
  isActive: boolean;
  onSelect?: () => void;
}) {
  return (
    <BibleSearchProvider
      initialTranslation={initialTranslation}
      isActive={isActive}
      onSelect={onSelect}
    >
      <BibleSearchContent isActive={isActive} />
    </BibleSearchProvider>
  );
}

function BibleSearchContent({ isActive }: { isActive: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
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
    onQueryChange,
    annotationError,
    annotationsReady,
    searching,
    previousPage,
    nextPage,
  } = useBibleSearch();

  useEffect(() => {
    if (isActive)
      rootRef.current
        ?.querySelector<HTMLInputElement>('input[aria-label]')
        ?.focus();
  }, [isActive]);

  return (
    <div className={cls.root} ref={rootRef}>
      <h2 className="sr-only">{m.bible_search_title()}</h2>
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
          <BibleSearchTranslationFilter />
          <BibleSearchBookFilterSelect />
          <BibleSearchHighlightsFilter />
          <BibleSearchNotesFilter />
          <BibleSearchAnnotationOrderSelect />
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
      {annotationError && (
        <p role="alert">{m.bible_search_annotations_error()}</p>
      )}
      <div role="status" aria-live="polite">
        {ready &&
        searching &&
        !annotationError &&
        (!annotationsReady || results.isFetching || rawQuery !== query)
          ? m.bible_search_loading()
          : shown
            ? shown.total
              ? m.bible_search_count({ count: shown.total })
              : m.bible_search_empty()
            : ''}
      </div>
      <BibleSearchResults />
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

function BibleSearchResults() {
  const { shown, record, select, onSelectVerse, myAnnotations } =
    useBibleSearch();
  const books = record?.manifest.books ?? [];
  const notesByVerse = new Map<VerseId, AnnotationRecord[]>();
  for (const note of myAnnotations) {
    for (const id of note.verses) {
      const notes = notesByVerse.get(id) ?? [];
      notes.push(note);
      notesByVerse.set(id, notes);
    }
  }
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
              disabled={select.isPending}
              onClick={() => onSelectVerse(verse.id)}
            >
              <strong>
                {title} {location.chapter}:{verse.label}
              </strong>
              <span>{parts}</span>
              {notesByVerse.get(verse.id)?.map((note) => (
                <Box
                  key={note.id}
                  render={<span />}
                  surface
                  border
                  p="sm"
                  className={cls.notePreview}
                >
                  <span className={cls.noteText}>{note.comment}</span>
                </Box>
              ))}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
