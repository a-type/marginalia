import { Box, Button, Icon } from '@a-type/ui';

import type { LocalAnnotation } from '#/lib/annotations/types';
import { m } from '#/paraglide/messages';
import cls from './AnnotationView.module.css';

export interface AnnotationViewProps {
  annotation: LocalAnnotation;
  onClose: () => void;
}

export function AnnotationView({ annotation, onClose }: AnnotationViewProps) {
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
      <Button aria-label={m.annotation_close()} onClick={onClose}>
        <Icon name="x" />
      </Button>
    </Box>
  );
}
