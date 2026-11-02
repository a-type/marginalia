import { Button, TextLink } from '@a-type/ui';
import { Link, useParams } from '@tanstack/react-router';

import { m } from '#/paraglide/messages';
import {
  parseBibleReference,
  type BibleReference,
} from '../../lib/bible/location';
import { formatVerseId } from '../../lib/bible/verse';
import { verseHashScrollIntoView } from '../../lib/bible/verse-scroll';
import { useReferenceSelections } from '../bible/useReferenceSelections';
import type { USFMNodeComponentProps } from './types';

export function Reference({ attributes, children }: USFMNodeComponentProps) {
  const translation = useParams({
    strict: false,
    select: (params) => params.translation,
  });
  const target = parseBibleReference(attributes.loc);

  if (!target || !translation) {
    return <span data-usfm-marker="ref">{children}</span>;
  }

  return (
    <ReferenceLink target={target} translation={translation}>
      {children}
    </ReferenceLink>
  );
}

function ReferenceLink({
  target,
  translation,
  children,
}: {
  target: BibleReference;
  translation: string;
  children: USFMNodeComponentProps['children'];
}) {
  const [{ verses, loading, unavailable, retry }] = useReferenceSelections(
    translation,
    [target],
  );
  if (loading || unavailable) {
    return (
      <span data-usfm-marker="ref">
        {children}{' '}
        <span role={unavailable ? 'alert' : 'status'}>
          {unavailable
            ? m.lexicon_passage_unavailable()
            : m.lexicon_passage_loading()}
        </span>
        {retry && (
          <Button size="small" onClick={() => void retry()}>
            {m.interlinear_retry()}
          </Button>
        )}
      </span>
    );
  }
  return (
    <TextLink
      data-usfm-marker="ref"
      render={
        <Link
          to="/$translation/$book/$chapter"
          params={{
            translation,
            book: target.bookId,
            chapter: String(target.chapter),
          }}
          search={{ verses }}
          hash={
            target.verse
              ? `verse-${formatVerseId(target.bookId, target.chapter, target.verse)}`
              : ''
          }
          hashScrollIntoView={verseHashScrollIntoView}
        />
      }
    >
      {children}
    </TextLink>
  );
}
