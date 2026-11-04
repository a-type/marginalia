import type { BibleLocation } from '#/lib/bible/location';
import type { TranslationManifest } from '#/lib/bible/manifests';
import { getAdjacentChapter } from '#/lib/bible/navigation';
import { m } from '#/paraglide/messages';
import { Box, Button, Icon, type BoxProps } from '@a-type/ui';
import cls from './ChapterNavigationButtons.module.css';

export interface ChapterNavigationButtonsProps extends BoxProps {
  goTo: (chapter: BibleLocation) => void;
  active: BibleLocation;
  manifest: TranslationManifest;
}

export function ChapterNavigationButtons({
  goTo,
  active,
  manifest,
  className,
  ...props
}: ChapterNavigationButtonsProps) {
  const previousChapter = getAdjacentChapter(manifest, active, -1);
  const nextChapter = getAdjacentChapter(manifest, active, 1);

  return (
    <Box layout="center center" role="group" className={className} {...props}>
      <Button
        aria-label={m.bible_previous_chapter()}
        onClick={() => {
          if (previousChapter) goTo(previousChapter);
        }}
        className={cls.button}
        disabled={!previousChapter}
      >
        <Icon name="arrowUp" />
      </Button>
      <Button
        aria-label={m.bible_next_chapter()}
        onClick={() => {
          if (nextChapter) goTo(nextChapter);
        }}
        className={cls.button}
        disabled={!nextChapter}
      >
        <Icon name="arrowDown" />
      </Button>
    </Box>
  );
}
