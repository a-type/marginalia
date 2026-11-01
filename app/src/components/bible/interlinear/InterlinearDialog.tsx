import { m } from '#/paraglide/messages';
import { Button, Dialog, type ButtonProps } from '@a-type/ui';
import { useState } from 'react';
import { useSelectedVerseIds } from '../../annotations/VerseSelection';
import { InterlinearContent } from './InterlinearContent';
import cls from './InterlinearContent.module.css';

export function InterlinearDialog({ children, ...props }: ButtonProps) {
  const [open, setOpen] = useState(false);
  const selectedVerses = useSelectedVerseIds();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={<Button size="small" emphasis="ghost" {...props} />}
        aria-label={m.interlinear_open()}
      >
        {children ?? m.interlinear_open()}
      </Dialog.Trigger>
      <Dialog.Content width="lg" className={cls.dialog}>
        <Dialog.Title>{m.interlinear_title()}</Dialog.Title>
        {open && <InterlinearContent selectedVerses={selectedVerses} />}
      </Dialog.Content>
    </Dialog>
  );
}
