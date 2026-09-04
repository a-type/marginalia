import { Box, Button, Icon } from '@a-type/ui';

import type { LocalAnnotation } from '#/lib/annotations/types';
import { m } from '#/paraglide/messages';
import cls from './AnnotationView.module.css';

export interface AnnotationViewProps {
  annotation: LocalAnnotation;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function AnnotationView({
  annotation,
  onClose,
  onPrevious,
  onNext,
}: AnnotationViewProps) {
  return (
    <Box
      gap
      p
      items="start"
      full="width"
      className={cls.root}
      data-color={annotation.color}
      role="note"
    >
      <span className={cls.comment}>
        {annotation.comment ?? m.annotation_highlight_only()}
      </span>
      <div className={cls.actions}>
        {onPrevious && onNext && (
          <div className={cls.navigation}>
            <Button aria-label={m.annotation_previous()} onClick={onPrevious}>
              <Icon name="arrowLeft" />
            </Button>
            <Button aria-label={m.annotation_next()} onClick={onNext}>
              <Icon name="arrowRight" />
            </Button>
          </div>
        )}
        <Button aria-label={m.annotation_close()} onClick={onClose}>
          <Icon name="x" />
        </Button>
      </div>
    </Box>
  );
}
