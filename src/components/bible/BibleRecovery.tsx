import { SettingsDialog } from '#/components/settings/SettingsDialog';
import { m } from '#/paraglide/messages';
import { Button, Icon } from '@a-type/ui';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import cls from './BibleRecovery.module.css';

export function BibleRecovery() {
  const [settings, setSettings] = useState(false);
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <main className={cls.root}>
      <h1>{m.bible_load_error()}</h1>
      <div className={cls.actions}>
        <Button onClick={() => void router.invalidate()}>
          <Icon name="refresh" />
          {m.translation_retry()}
        </Button>
        <Button
          onClick={() =>
            void navigate({ to: '/', state: { skipHomeRestore: true } })
          }
        >
          <Icon name="book" />
          {m.bible_recovery_home()}
        </Button>
        <Button onClick={() => setSettings(true)}>
          <Icon name="gear" />
          {m.elegant_watery_oryx_radiate()}
        </Button>
      </div>
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </main>
  );
}
