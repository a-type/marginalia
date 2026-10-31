import {
  Box,
  Button,
  P,
  useIsInstalled,
  useIsInstallReady,
  useLocalStorage,
} from '@a-type/ui';
import { InstallButton } from './InstallButton.tsx';

export interface InstallHintProps {
  content: string;
  className?: string;
}

export function InstallHint({
  content: contentStr,
  className,
}: InstallHintProps) {
  const [isDismissed, setIsDismissed] = useLocalStorage(
    'margins:pwa-install-hint-dismissed',
    false,
  );

  const installReady = useIsInstallReady();
  const isInstalled = useIsInstalled();

  if (isDismissed || isInstalled || !installReady) {
    return null;
  }

  return (
    <Box
      surface="secondary"
      color="primary"
      p
      col
      gap
      items="stretch"
      className={className}
    >
      <P>{contentStr}</P>
      <Box gap full="width" items="center" justify="end">
        <Button emphasis="ghost" onClick={() => setIsDismissed(true)}>
          Dismiss
        </Button>
        <InstallButton emphasis="primary" size="default" />
      </Box>
    </Box>
  );
}
