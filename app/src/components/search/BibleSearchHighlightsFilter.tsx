import { m } from '#/paraglide/messages';
import { Button } from '@a-type/ui';
import { useBibleSearch } from './BibleSearchContext';

export function BibleSearchHighlightsFilter() {
  const { myHighlights, onMyHighlightsChange } = useBibleSearch();
  return (
    <Button
      size="small"
      toggled={myHighlights}
      onClick={() => onMyHighlightsChange(!myHighlights)}
    >
      {m.bible_search_my_highlights()}
    </Button>
  );
}
