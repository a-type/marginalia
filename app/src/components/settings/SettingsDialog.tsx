import { m } from '#/paraglide/messages';
import type { DialogProps } from '@a-type/ui';
import { Box, Button, ColorModeToggle, Dialog, Icon } from '@a-type/ui';
import { useState } from 'react';
import { TranslationManagerDialog } from './TranslationManagerDialog';

export interface SettingsDialogProps extends DialogProps {}

export function SettingsDialog(props: SettingsDialogProps) {
  const [showTranslations, setShowTranslations] = useState(false);
  return (
    <>
      <Dialog {...props}>
        <Dialog.Content>
          <Dialog.Title>{m.elegant_watery_oryx_radiate()}</Dialog.Title>
          <Box col gap>
            <ColorModeToggle />
            <Button onClick={() => setShowTranslations(true)}>
              <Icon name="book" />
              {m.translation_manage_stored()}
            </Button>
          </Box>
        </Dialog.Content>
      </Dialog>
      <TranslationManagerDialog
        open={showTranslations}
        onOpenChange={setShowTranslations}
      />
    </>
  );
}
