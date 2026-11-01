import { m } from '#/paraglide/messages';
import { Button, Popover } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import type { LexiconReference } from '../../../lib/bible/lexicon-definition';
import { resolveVerseSelection } from '../../../lib/bible/selection';
import { AppError } from '../../../lib/error';
import { translationBookVersesQueryOptions } from '../../../queries/translations';
import cls from './LexiconReferenceItem.module.css';

export function LexiconReferenceItem({
  reference,
}: {
  reference: LexiconReference;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button size="small" emphasis="ghost" className={cls.trigger} />
          }
        >
          {reference.label}
        </Popover.Trigger>
        <Popover.Content className={cls.popup}>
          <Popover.Title>{reference.label}</Popover.Title>
          <Popover.Close aria-label={m.lexicon_passage_close()} />
          {open && <PassagePreview reference={reference} />}
        </Popover.Content>
      </Popover>
    </>
  );
}

function PassagePreview({ reference }: { reference: LexiconReference }) {
  const translationId = useParams({
    strict: false,
    select: (params) => params.translation,
  });
  if (!translationId) {
    throw new AppError(
      AppError.Code.BadRequest,
      'A reading translation is required for a lexicon verse preview',
    );
  }
  const query = useQuery(
    translationBookVersesQueryOptions(translationId, reference.passage.bookId),
  );
  if (query.isPending)
    return <p role="status">{m.lexicon_passage_loading()}</p>;
  if (query.isError) {
    return (
      <div role="alert">
        <p>{m.lexicon_passage_error()}</p>
        <Button size="small" emphasis="light" onClick={() => query.refetch()}>
          {m.interlinear_retry()}
        </Button>
      </div>
    );
  }
  if (!query.data.available) {
    return <p>{m.lexicon_passage_unavailable()}</p>;
  }
  const ids = new Set(
    resolveVerseSelection(
      reference.passage.verses,
      reference.passage.chapter,
      query.data.verses.map(({ id }) => id),
    ),
  );
  const verses = query.data.verses.filter(({ id }) => ids.has(id));
  if (!verses.length) return <p>{m.lexicon_passage_unavailable()}</p>;
  return (
    <div className={cls.passage} lang={query.data.language} dir="auto">
      <span className={cls.translation}>{query.data.title}</span>
      {verses.map(({ id, label, text }) => (
        <p key={id}>
          <sup>{label}</sup> {text}
        </p>
      ))}
    </div>
  );
}
