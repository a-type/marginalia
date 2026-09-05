import { Button, Text, TextArea, ToggleGroup } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';
import { useState } from 'react';

import { createAnnotation } from '#/lib/annotations/create';
import type { AnnotationColor } from '#/lib/annotations/types';
import { annotationColors } from '#/lib/annotations/types';
import type { VerseId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import cls from './AnnotationEditor.module.css';

export interface AnnotationEditorProps {
  verses: readonly VerseId[];
  addingVerses: boolean;
  onAddingVersesChange: (adding: boolean) => void;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

export function AnnotationEditor({
  verses,
  addingVerses,
  onAddingVersesChange,
  onCancel,
  onSaved,
}: AnnotationEditorProps) {
  const dbClient = useDbClient();
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
      await createAnnotation(dbClient, {
        verses,
        comment,
        ...(color ? { color } : {}),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
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
          rows={3}
          autoSize={false}
        />
      </label>
      {error && (
        <Text className="@mode-attention">{m.annotation_validation()}</Text>
      )}
      <div className={cls.actions}>
        <Button
          type="button"
          aria-pressed={addingVerses}
          onClick={() => onAddingVersesChange(!addingVerses)}
        >
          {addingVerses
            ? m.annotation_finish_adding_verses()
            : m.annotation_add_more_verses()}
        </Button>
        <span className={cls.spacer} />
        <Button type="button" onClick={onCancel}>
          {m.annotation_cancel()}
        </Button>
        <Button type="submit" emphasis="primary" loading={saving}>
          {m.annotation_submit()}
        </Button>
      </div>
    </form>
  );
}
