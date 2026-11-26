import { m } from '#/paraglide/messages';
import { Button } from '@a-type/ui';
import { useBibleSearch } from './BibleSearchContext';

export function BibleSearchNotesFilter() {
  const { myNotes, onMyNotesChange } = useBibleSearch();
  return (
    <Button
      size="small"
      toggled={myNotes}
      onClick={() => onMyNotesChange(!myNotes)}
    >
      {m.bible_search_my_notes()}
    </Button>
  );
}
