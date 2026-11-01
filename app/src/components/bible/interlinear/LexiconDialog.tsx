import { m } from '#/paraglide/messages';
import { Button, Dialog } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { LexiconSense } from '../../../lib/bible/lexicon';
import { lexiconEntryQueryOptions } from '../../../queries/lexicon';
import { LexiconDefinition } from './LexiconDefinition';
import cls from './LexiconDialog.module.css';

export function LexiconDialog({ strongsId }: { strongsId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            size="small"
            emphasis="ghost"
            className={cls.trigger}
            aria-label={m.lexicon_open({ strongs: strongsId })}
          />
        }
      >
        {strongsId}
      </Dialog.Trigger>
      <Dialog.Content width="lg" className={cls.dialog}>
        <Dialog.Title>{m.lexicon_title({ strongs: strongsId })}</Dialog.Title>
        {open && <LexiconEntryView strongsId={strongsId} />}
        <p className={cls.attribution}>
          {m.lexicon_attribution()}{' '}
          <a
            href="https://github.com/STEPBible/STEPBible-Data"
            target="_blank"
            rel="noreferrer"
          >
            STEPBible.org / Tyndale House, Cambridge
          </a>{' '}
          (
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
          ). {m.lexicon_changes()}
        </p>
      </Dialog.Content>
    </Dialog>
  );
}

function LexiconEntryView({ strongsId }: { strongsId: string }) {
  const query = useQuery(lexiconEntryQueryOptions(strongsId));

  if (query.isPending) {
    return <p role="status">{m.lexicon_loading()}</p>;
  }
  if (query.isError) {
    return (
      <div role="alert" className={cls.status}>
        <p>{m.lexicon_error()}</p>
        <Button size="small" emphasis="light" onClick={() => query.refetch()}>
          {m.interlinear_retry()}
        </Button>
      </div>
    );
  }
  if (!query.data.available) {
    return <p>{m.lexicon_unavailable({ strongs: strongsId })}</p>;
  }

  const hebrew = strongsId.toUpperCase().startsWith('H');
  return (
    <div className={cls.senses}>
      {query.data.entry.senses.map((sense) => (
        <LexiconSenseView key={sense.id} sense={sense} hebrew={hebrew} />
      ))}
    </div>
  );
}

function LexiconSenseView({
  sense,
  hebrew,
}: {
  sense: LexiconSense;
  hebrew: boolean;
}) {
  return (
    <article className={cls.sense}>
      <header className={cls.senseHeader}>
        <span
          className={cls.lemma}
          lang={hebrew ? 'he' : 'el'}
          dir={hebrew ? 'rtl' : 'ltr'}
        >
          {sense.lemma}
        </span>
        {sense.transliteration && (
          <span className={cls.meta}>{sense.transliteration}</span>
        )}
        {sense.partOfSpeech && (
          <span className={cls.meta}>{sense.partOfSpeech}</span>
        )}
        <span className={cls.meta}>{sense.id}</span>
      </header>
      {sense.gloss && (
        <p className={cls.gloss} lang="en">
          {sense.gloss}
        </p>
      )}
      {sense.definition && <LexiconDefinition definition={sense.definition} />}
    </article>
  );
}
