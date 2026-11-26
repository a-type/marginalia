import { TranslationSelect } from '../bible/TranslationSelect';
import { useBibleSearch } from './BibleSearchContext';

export function BibleSearchTranslationFilter() {
  const { translationId, onTranslationChange } = useBibleSearch();
  return (
    <TranslationSelect
      value={translationId}
      installedOnly
      onValueChange={(value) => value && onTranslationChange(value)}
      size="small"
    />
  );
}
