import {
  Button,
  FormikForm,
  TextAreaField,
  ToggleGroupField,
} from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';

import { createAnnotation } from '#/lib/annotations/create';
import type { AnnotationColor } from '#/lib/annotations/types';
import { annotationColors } from '#/lib/annotations/types';
import type { VerseId } from '#/lib/bible/verse';
import { m } from '#/paraglide/messages';
import z from 'zod';
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
  const submit = async ({
    color,
    comment,
  }: {
    color: AnnotationColor | null;
    comment: string;
  }) => {
    if (!color && !comment.trim()) {
      return;
    }

    await createAnnotation(dbClient, {
      verses,
      comment,
      ...(color ? { color } : {}),
    });
    await onSaved();
  };

  return (
    <FormikForm
      className={cls.form}
      onSubmit={submit}
      initialValues={{ color: null, comment: '' }}
      validationSchema={z
        .object({
          color: z.string().optional(),
          comment: z.string().optional(),
        })
        .refine(({ color, comment }) => {
          if (!color && !comment?.trim()) {
            return m.annotation_validation();
          }
          return true;
        })}
    >
      <ToggleGroupField name="color" label={m.annotation_color_label()}>
        <ToggleGroupField.Item value="none">
          {m.annotation_color_none()}
        </ToggleGroupField.Item>
        {annotationColors.map((value) => (
          <ToggleGroupField.Item
            key={value}
            value={value}
            aria-label={value}
            className={`@mode-${value}`}
          >
            <span className={cls.swatch} />
          </ToggleGroupField.Item>
        ))}
      </ToggleGroupField>
      <TextAreaField
        name="comment"
        label={m.annotation_comment_label()}
        autoSize={false}
        placeholder={m.annotation_comment_placeholder()}
        className={cls.commentField}
      />
      <FormikForm.Error />
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
        <FormikForm.SubmitButton>
          {m.annotation_submit()}
        </FormikForm.SubmitButton>
      </div>
    </FormikForm>
  );
}
