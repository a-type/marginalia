import { m } from '#/paraglide/messages';
import type { DialogProps } from '@a-type/ui';
import { ColorModeToggle, Dialog } from '@a-type/ui';
import { TranslationManager } from './TranslationManager';

export interface SettingsDialogProps extends DialogProps {}

export function SettingsDialog(props: SettingsDialogProps) {
  return (
    <Dialog {...props}>
      <Dialog.Content>
        <Dialog.Title>{m.elegant_watery_oryx_radiate()}</Dialog.Title>
        <ColorModeToggle />
        <TranslationManager />
      </Dialog.Content>
    </Dialog>
  );
}
