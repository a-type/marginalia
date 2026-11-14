import { m } from '#/paraglide/messages';
import type { DialogProps } from '@a-type/ui';
import { Box, Button, ColorModeToggle, Dialog, Icon, Switch } from '@a-type/ui';
import { useState } from 'react';
import { TranslationManagerDialog } from './TranslationManagerDialog';
import { useDeveloperStatusBar } from './useDeveloperStatusBar';

export interface SettingsDialogProps extends DialogProps {}

export function SettingsDialog(props: SettingsDialogProps) {
  const [showTranslations, setShowTranslations] = useState(false);
  const [developerStatusBar, setDeveloperStatusBar] = useDeveloperStatusBar();
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
            <Box render={<label />} gap items="center">
              <Switch
                checked={developerStatusBar}
                onCheckedChange={setDeveloperStatusBar}
              />
              {m.settings_developer_status_bar()}
            </Box>
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
