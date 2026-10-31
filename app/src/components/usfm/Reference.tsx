import { TextLink } from '@a-type/ui';
import { Link, useParams } from '@tanstack/react-router';

import { parseBibleReference } from '../../lib/bible/location';
import { formatVerseId } from '../../lib/bible/verse';
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
          search={{ verses: target.verses }}
          hash={
            target.verse
              ? `verse-${formatVerseId(target.bookId, target.chapter, target.verse)}`
              : ''
          }
          hashScrollIntoView={{ block: 'center', behavior: 'instant' }}
        />
      }
    >
      {children}
    </TextLink>
  );
}
