import { m } from '#/paraglide/messages';
import { Button, Dialog } from '@a-type/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnapshot } from 'valtio';

import {
  happyViewAuthState,
  reauthenticateHappyView,
} from '../../lib/atproto/client';
import { logger } from '../../logger';

export function SessionRecovery() {
  const { expiredDid, promptOpen } = useSnapshot(happyViewAuthState);
  const queryClient = useQueryClient();
  const recovery = useMutation({
    mutationFn: reauthenticateHappyView,
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error) => {
      logger.warn('HappyView re-authentication failed', error);
    },
  });

  return (
    <Dialog
      open={!!expiredDid && promptOpen}
      onOpenChange={(open) => {
        happyViewAuthState.promptOpen = open;
      }}
    >
      <Dialog.Content>
        <Dialog.Title>{m.session_expired_title()}</Dialog.Title>
        <Dialog.Description>
          {m.session_expired_description()}
        </Dialog.Description>
        {recovery.isError ? (
          <p role="alert">{m.session_recovery_error()}</p>
        ) : null}
        <Dialog.Actions>
          <Dialog.Close>{m.session_recovery_later()}</Dialog.Close>
          <Button
            emphasis="primary"
            disabled={recovery.isPending}
            onClick={() => recovery.mutate()}
          >
            {recovery.isPending
              ? m.session_recovery_pending()
              : m.session_recovery_sign_in()}
          </Button>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog>
  );
}
