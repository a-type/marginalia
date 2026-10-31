import { Box, Button, Dialog, Icon } from '@a-type/ui';
import { useState } from 'react';

import { m } from '#/paraglide/messages';
import type { AnnotationRecord } from '../../lib/annotations/collections';
import cls from './AnnotationView.module.css';

export interface AnnotationViewProps {
  annotation: AnnotationRecord;
  onClose: () => void;
  onAdd: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
  deleteError?: string;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function AnnotationView({
  annotation,
  onClose,
  onAdd,
  onDelete,
  deletePending = false,
  deleteError,
  onPrevious,
  onNext,
}: AnnotationViewProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Box
        gap
        col
        p="sm"
        items="stretch"
        full="width"
        className={cls.root}
        role="note"
      >
        <Box gap="sm" justify="between">
          <Button onClick={onAdd}>
            <Icon name="add_note" /> {m.annotation_add()}
          </Button>
          <Box gap="sm" items="center">
            {onDelete && (
              <Button
                aria-label={m.annotation_delete()}
                disabled={deletePending}
                onClick={() => setDeleteOpen(true)}
              >
                <Icon name="trash" />
              </Button>
            )}
            {onPrevious && onNext && (
              <>
                <Button
                  aria-label={m.annotation_previous()}
                  onClick={onPrevious}
                >
                  <Icon name="arrowLeft" />
                </Button>
                <Button aria-label={m.annotation_next()} onClick={onNext}>
                  <Icon name="arrowRight" />
                </Button>
              </>
            )}
            <Button aria-label={m.annotation_close()} onClick={onClose}>
              <Icon name="x" />
            </Button>
          </Box>
        </Box>
        <span className={cls.comment}>{annotation.comment}</span>
      </Box>
      {onDelete && (
        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!open && !deletePending) setDeleteOpen(false);
          }}
        >
          <Dialog.Content>
            <Dialog.Title>{m.annotation_delete_confirm()}</Dialog.Title>
            <Dialog.Description>
              {m.annotation_delete_description()}
            </Dialog.Description>
            {deleteError && <p role="alert">{deleteError}</p>}
            <Dialog.Actions>
              <Dialog.Close disabled={deletePending}>
                {m.annotation_cancel()}
              </Dialog.Close>
              <Button
                disabled={deletePending}
                emphasis="light"
                color="attention"
                onClick={onDelete}
              >
                <Icon name="trash" /> {m.annotation_delete()}
              </Button>
            </Dialog.Actions>
          </Dialog.Content>
        </Dialog>
      )}
    </>
  );
}
