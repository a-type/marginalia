import type { BibleLocation } from '#/lib/bible/location';
import type { TranslationManifest } from '#/lib/bible/manifests';
import { getAdjacentChapter } from '#/lib/bible/navigation';
import { m } from '#/paraglide/messages';
import { Box, Button, Icon, type BoxProps, type ButtonProps } from '@a-type/ui';
import { getRouteApi, useLocation } from '@tanstack/react-router';
import cls from './ChapterNavigationButtons.module.css';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export interface ChapterNavigationButtonsProps extends Omit<
  BoxProps,
  'emphasis'
> {
  goTo: (chapter: BibleLocation) => void;
  active: BibleLocation;
  manifest: TranslationManifest;
  emphasis?: ButtonProps['emphasis'];
}

export function ChapterNavigationButtons({
  goTo,
  active,
  manifest,
  className,
  emphasis,
  ...props
}: ChapterNavigationButtonsProps) {
  const navigate = readerRoute.useNavigate();
  const { location, translationId } = readerRoute.useLoaderData();
  const activeReadingTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  const previousChapter = getAdjacentChapter(manifest, active, -1);
  const nextChapter = getAdjacentChapter(manifest, active, 1);
  const navigateTo = async (target: BibleLocation) => {
    await navigate({
      params: {
        translation: translationId,
        book: target.bookId,
        chapter: String(target.chapter),
      },
      state: (previous) => ({
        ...previous,
        activeReadingTabId,
        readingPosition: undefined,
      }),
      search: {},
      resetScroll: false,
    });
    if (
      location.bookId === target.bookId &&
      location.chapter === target.chapter
    )
      goTo(target);
  };

  return (
    <Box
      layout="center center"
      role="group"
      gap="xs"
      className={className}
      {...props}
    >
      <Button
        aria-label={m.bible_previous_chapter()}
        onClick={() => {
          if (previousChapter) void navigateTo(previousChapter);
        }}
        className={cls.button}
        emphasis={emphasis}
        disabled={!previousChapter}
      >
        <Icon name="arrowUp" />
      </Button>
      <Button
        aria-label={m.bible_next_chapter()}
        onClick={() => {
          if (nextChapter) void navigateTo(nextChapter);
        }}
        className={cls.button}
        emphasis={emphasis}
        disabled={!nextChapter}
      >
        <Icon name="arrowDown" />
      </Button>
    </Box>
  );
}
