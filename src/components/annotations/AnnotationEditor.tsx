import { Button, FormikForm, TextAreaField } from '@a-type/ui';
import { useDbClient } from '@tanstack/react-db';

import { createAnnotation } from '#/lib/annotations/create';
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

const schema = z
  .object({
    comment: z.string().optional(),
  })
  .refine(({ comment }) => {
    if (!comment?.trim()) {
      return m.annotation_validation();
    }
    return true;
  });

export function AnnotationEditor({
  verses,
  addingVerses,
  onAddingVersesChange,
  onCancel,
  onSaved,
}: AnnotationEditorProps) {
  const dbClient = useDbClient();
  const submit = async ({ comment }: { comment: string }) => {
    if (!comment.trim()) return;

    await createAnnotation(dbClient, { verses, comment });
    await onSaved();
  };

  return (
    <FormikForm
      className={cls.form}
      onSubmit={submit}
      initialValues={{ comment: '' }}
      validate={(values) => {
        const result = schema.safeParse(values);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return {};
      }}
    >
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
