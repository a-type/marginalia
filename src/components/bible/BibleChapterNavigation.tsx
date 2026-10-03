import { Button, Icon, Tooltip } from '@a-type/ui';
import { getRouteApi } from '@tanstack/react-router';

import type { BibleLocation } from '#/lib/bible/location';
import { getAdjacentChapter } from '#/lib/bible/navigation';
import type { TranslationManifest } from '#/lib/bible/source';
import { m } from '#/paraglide/messages';
import cls from './BibleChapterNavigation.module.css';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export function BibleChapterNavigation({
  location,
  manifest,
  translationId,
}: {
  location: BibleLocation;
  manifest: TranslationManifest;
  translationId: string;
}) {
  const navigate = readerRoute.useNavigate();
  const previous = getAdjacentChapter(manifest, location, -1);
  const next = getAdjacentChapter(manifest, location, 1);

  const navigateTo = (target: BibleLocation | undefined) => {
    if (!target) return;
    void navigate({
      params: {
        translation: translationId,
        book: target.bookId,
        chapter: String(target.chapter),
      },
      search: {},
      resetScroll: true,
    }).then(() => {
      requestAnimationFrame(() => {
        let viewport = document.querySelector(
          '[data-chapter-navigation]',
        )?.parentElement;
        while (
          viewport &&
          !['auto', 'scroll'].includes(getComputedStyle(viewport).overflowY)
        ) {
          viewport = viewport.parentElement;
        }
        viewport?.scrollTo({ top: 0, behavior: 'instant' });
      });
    });
  };

  return (
    <nav
      data-chapter-navigation
      className={cls.chapterNavigation}
      aria-label={m.bible_chapter_navigation()}
    >
      <Tooltip content={m.bible_previous_chapter()}>
        <Button
          className={cls.chapterNavigationButton}
          aria-label={m.bible_previous_chapter()}
          disabled={!previous}
          onClick={() => navigateTo(previous)}
        >
          <Icon name="arrowLeft" />
        </Button>
      </Tooltip>
      <Tooltip content={m.bible_next_chapter()}>
        <Button
          className={cls.chapterNavigationButton}
          aria-label={m.bible_next_chapter()}
          disabled={!next}
          onClick={() => navigateTo(next)}
        >
          <Icon name="arrowRight" />
        </Button>
      </Tooltip>
    </nav>
  );
}
