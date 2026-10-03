import type { DialogProps } from '@a-type/ui';
import { ColorModeToggle, Dialog } from '@a-type/ui';

export interface SettingsDialogProps extends DialogProps {}

export function SettingsDialog(props: SettingsDialogProps) {
  return (
    <Dialog {...props}>
      <Dialog.Content>
        <Dialog.Title>Settings</Dialog.Title>
        <ColorModeToggle />
      </Dialog.Content>
    </Dialog>
  );
}
