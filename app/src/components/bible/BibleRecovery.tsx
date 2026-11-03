import { m } from '#/paraglide/messages';
import { Button, Icon } from '@a-type/ui';
import {
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { parseBibleLocation } from '../../lib/bible/location';
import { isTranslationId } from '../../lib/bible/source';
import { AppShell } from '../app/AppShell';
import { useCloseReadingTab } from '../app/readingTabs';
import { SettingsDialog } from '../settings/SettingsDialog';
import cls from './BibleRecovery.module.css';
import { TranslationAlternatives } from './TranslationAlternatives';

export function BibleRecovery() {
  const [settings, setSettings] = useState(false);
  const router = useRouter();
  const navigate = useNavigate();
  const closeTab = useCloseReadingTab();
  const tabId = useLocation({
    select: (location) => location.state.activeReadingTabId,
  });
  const { translation, book, chapter } = useParams({ strict: false });
  const location = book && chapter ? parseBibleLocation(book, chapter) : null;
  return (
    <AppShell>
      <div className={cls.root}>
        <h1>{m.bible_load_error()}</h1>
        <div className={cls.actions}>
          {tabId && (
            <Button onClick={() => closeTab(tabId)}>
              <Icon name="x" />
              {m.bible_recovery_close()}
            </Button>
          )}
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
        {translation && isTranslationId(translation) && location && (
          <TranslationAlternatives
            translationId={translation}
            location={location}
          />
        )}
        <SettingsDialog open={settings} onOpenChange={setSettings} />
      </div>
    </AppShell>
  );
}
