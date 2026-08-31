import { Button, Dialog, Text, TextArea, ToggleGroup } from '@a-type/ui';
import { useState } from 'react';

import { createAnnotation } from '#/lib/annotations/create';
import type { AnnotationColor } from '#/lib/annotations/types';
import { annotationColors } from '#/lib/annotations/types';
import type { VerseId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import cls from './AnnotationDialog.module.css';

export interface AnnotationDialogProps {
  open: boolean;
  verses: readonly VerseId[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}

export function AnnotationDialog({
  open,
  verses,
  onOpenChange,
  onSaved,
}: AnnotationDialogProps) {
  const [color, setColor] = useState<AnnotationColor | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!color && !comment.trim()) {
      setError(true);
      return;
    }

    setSaving(true);
    try {
      await createAnnotation({
        verses,
        comment,
        ...(color ? { color } : {}),
      });
      setColor(null);
      setComment('');
      setError(false);
      await onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content width="sm">
        <Dialog.Title>{m.annotation_dialog_title()}</Dialog.Title>
        <form className={cls.form} onSubmit={submit}>
          <fieldset className={cls.fieldset}>
            <legend>{m.annotation_color_label()}</legend>
            <ToggleGroup
              value={[color ?? 'none']}
              onValueChange={(values) => {
                const value = values.at(-1);
                setColor(
                  annotationColors.includes(value as AnnotationColor)
                    ? (value as AnnotationColor)
                    : null,
                );
                setError(false);
              }}
            >
              <ToggleGroup.Item value="none">
                {m.annotation_color_none()}
              </ToggleGroup.Item>
              {annotationColors.map((value) => (
                <ToggleGroup.Item
                  key={value}
                  value={value}
                  aria-label={value}
                  className={`@mode-${value}`}
                >
                  <span className={cls.swatch} />
                </ToggleGroup.Item>
              ))}
            </ToggleGroup>
          </fieldset>
          <label className={cls.field}>
            <span>{m.annotation_comment_label()}</span>
            <TextArea
              value={comment}
              onValueChange={(value) => {
                setComment(value);
                setError(false);
              }}
              placeholder={m.annotation_comment_placeholder()}
              rows={4}
              autoSize={false}
            />
          </label>
          {error && (
            <Text className="@mode-attention">{m.annotation_validation()}</Text>
          )}
          <Dialog.Actions>
            <Dialog.Close />
            <Button type="submit" emphasis="primary" loading={saving}>
              {m.annotation_submit()}
            </Button>
          </Dialog.Actions>
        </form>
      </Dialog.Content>
    </Dialog>
  );
}
