import { m } from '#/paraglide/messages';
import type { DialogProps } from '@a-type/ui';
import { Dialog } from '@a-type/ui';
import type { FetchBibleTranslation } from '../../lib/bible/fetch-bible';
import { TranslationManager } from './TranslationManager';
import cls from './TranslationManagerDialog.module.css';

export function TranslationManagerDialog({
  onSelect,
  ...props
}: DialogProps & {
  onSelect?: (translation: FetchBibleTranslation) => void;
}) {
  return (
    <Dialog {...props}>
      <Dialog.Content
        width="lg"
        className={cls.root}
        innerClassName={cls.inner}
      >
        <Dialog.Title>{m.translations_title()}</Dialog.Title>
        <TranslationManager onSelect={onSelect} />
      </Dialog.Content>
    </Dialog>
  );
}
