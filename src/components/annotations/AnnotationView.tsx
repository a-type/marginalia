import { Box, Button, Icon } from '@a-type/ui';

import type { AnnotationRecord } from '#/lib/annotations/collections';
import { m } from '#/paraglide/messages';
import cls from './AnnotationView.module.css';

export interface AnnotationViewProps {
  annotation: AnnotationRecord;
  onClose: () => void;
  onAdd: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function AnnotationView({
  annotation,
  onClose,
  onAdd,
  onPrevious,
  onNext,
}: AnnotationViewProps) {
  return (
    <Box
      gap
      col
      p="sm"
      items="stretch"
      full="width"
      className={cls.root}
      data-color={annotation.color}
      role="note"
    >
      <Box gap="sm" justify="between">
        <Button onClick={onAdd}>
          <Icon name="add_note" /> {m.annotation_add()}
        </Button>
        <Box gap="sm" items="center">
          {onPrevious && onNext && (
            <>
              <Button aria-label={m.annotation_previous()} onClick={onPrevious}>
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
      <span className={cls.comment}>
        {annotation.comment ?? m.annotation_highlight_only()}
      </span>
    </Box>
  );
}
