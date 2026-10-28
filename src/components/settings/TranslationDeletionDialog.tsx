import { m } from '#/paraglide/messages';
import { Button, Dialog, Icon } from '@a-type/ui';

export function TranslationDeletionDialog({
  deleting,
  error,
  pending,
  isDefault,
  onClose,
  onConfirm,
}: {
  deleting?: { id: string; title: string };
  error?: string;
  pending: boolean;
  isDefault: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(deleting)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content>
        <Dialog.Title>
          {m.translation_delete_confirm({ title: deleting?.title ?? '' })}
        </Dialog.Title>
        <Dialog.Description>
          {deleting?.id.startsWith('local-')
            ? m.translation_delete_import()
            : isDefault
              ? m.translation_delete_default()
              : m.translation_delete()}
        </Dialog.Description>
        {error && <p role="alert">{error}</p>}
        <Dialog.Actions>
          <Dialog.Close>{m.annotation_cancel()}</Dialog.Close>
          <Button disabled={pending} onClick={onConfirm}>
            <Icon name="trash" />
            {m.translation_delete()}
          </Button>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog>
  );
}
