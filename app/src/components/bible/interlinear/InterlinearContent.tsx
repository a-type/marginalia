import { m } from '#/paraglide/messages';
import { clsx, Field, P, Switch, useLocalStorage } from '@a-type/ui';
import { useId } from 'react';
import { groupInterlinearSelection } from '../../../lib/bible/interlinear';
import type { VerseId } from '../../../lib/bible/verse';
import { InterlinearChapterVerses } from './InterlinearChapterVerses';
import cls from './InterlinearContent.module.css';

export function InterlinearContent({
  selectedVerses,
}: {
  selectedVerses: readonly VerseId[];
}) {
  const [englishOrder, setEnglishOrder] = useLocalStorage(
    'margins:interlinear-use-english-order',
    false,
  );
  const orderId = useId();
  const groups = groupInterlinearSelection(selectedVerses);

  return (
    <div className={cls.content}>
      <Field className={cls.orderToggle}>
        <Field.Control
          render={
            <Switch
              id={orderId}
              checked={englishOrder}
              onCheckedChange={setEnglishOrder}
            />
          }
        />
        <Field.Label htmlFor={orderId}>
          {m.interlinear_english_order()}
        </Field.Label>
      </Field>
      <div className={cls.chapters}>
        {groups.map((group) => (
          <InterlinearChapterVerses
            key={`${group.book}/${group.chapter}`}
            group={group}
            englishOrder={englishOrder}
          />
        ))}
      </div>
      <P
        emphasis="ambient"
        dim
        className={clsx('@mode-denser', cls.attribution)}
      >
        {m.interlinear_attribution()}{' '}
        <a href="https://berean.bible/" target="_blank" rel="noreferrer">
          Berean Standard Bible
        </a>
        {' · '}
        <a href="https://bible.helloao.org/" target="_blank" rel="noreferrer">
          AO Bible API
        </a>
      </P>
    </div>
  );
}
