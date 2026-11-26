import { m } from '#/paraglide/messages';
import { Select } from '@a-type/ui';
import { useBibleSearch } from './BibleSearchContext';

export function BibleSearchAnnotationOrderSelect() {
  const { annotationOrder, onAnnotationOrderChange, myNotes, myHighlights } =
    useBibleSearch();
  if (!myNotes && !myHighlights) return null;
  return (
    <Select value={annotationOrder} onValueChange={onAnnotationOrderChange}>
      <Select.Trigger
        size="small"
        aria-label={m.bible_search_annotation_order()}
      >
        <span>
          {annotationOrder === 'newest'
            ? m.bible_search_newest_first()
            : m.bible_search_oldest_first()}
        </span>
        <Select.Icon />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="newest">
          {m.bible_search_newest_first()}
        </Select.Item>
        <Select.Item value="oldest">
          {m.bible_search_oldest_first()}
        </Select.Item>
      </Select.Content>
    </Select>
  );
}
