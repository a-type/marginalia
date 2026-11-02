import type { ReactNode } from 'react';

import { Button, Icon, Tooltip } from '@a-type/ui';
import { getRouteApi, useLocation, useRouter } from '@tanstack/react-router';

import { m } from '#/paraglide/messages';
import type { BibleLocation } from '../../lib/bible/location';
import { getAdjacentChapter } from '../../lib/bible/navigation';
import { checkpointReadingPosition } from '../../lib/bible/reading-history';
import type { TranslationManifest } from '../../lib/bible/source';
import cls from './BibleChapterNavigation.module.css';

const readerRoute = getRouteApi('/$translation/$book/$chapter');

export function BibleChapterNavigation({
  children,
  location,
  getLocation,
  manifest,
  translationId,
}: {
  children: ReactNode;
  location: BibleLocation;
  getLocation: () => BibleLocation;
  manifest: TranslationManifest;
  translationId: string;
}) {
  const navigate = readerRoute.useNavigate();
  const router = useRouter();
  const activeReadingTabId = useLocation({
    select: (routeLocation) => routeLocation.state.activeReadingTabId,
  });
  const previous = getAdjacentChapter(manifest, location, -1);
  const next = getAdjacentChapter(manifest, location, 1);

  const navigateTo = (direction: -1 | 1) => {
    const current = getLocation();
    const target = getAdjacentChapter(manifest, current, direction);
    if (!target) return;
    checkpointReadingPosition(router.history, current);
    void navigate({
      params: {
        translation: translationId,
        book: target.bookId,
        chapter: String(target.chapter),
      },
      state: (currentState) => ({
        ...currentState,
        activeReadingTabId,
        readingPosition: undefined,
      }),
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
        const chapter = [
          ...(viewport?.querySelectorAll<HTMLElement>(
            '[data-reader-chapter]',
          ) ?? []),
        ].find(
          (element) =>
            element.dataset.readerChapter ===
            `${target.bookId}/${target.chapter}`,
        );
        if (viewport && chapter) {
          viewport.scrollTo({
            top:
              viewport.scrollTop +
              chapter.getBoundingClientRect().top -
              viewport.getBoundingClientRect().top,
            behavior: 'instant',
          });
        }
      });
    });
  };

  return (
    <nav
      data-chapter-navigation
      className={cls.chapterNavigation}
      aria-label={m.bible_chapter_navigation()}
    >
      <div className={cls.chapterNavigationControls}>
        <Tooltip content={m.bible_previous_chapter()}>
          <Button
            className={cls.chapterNavigationButton}
            aria-label={m.bible_previous_chapter()}
            disabled={!previous}
            onClick={() => navigateTo(-1)}
          >
            <Icon name="arrowLeft" />
          </Button>
        </Tooltip>
      </div>
      <div className={cls.chapterNavigationCenter}>{children}</div>
      <div className={cls.chapterNavigationControls}>
        <Tooltip content={m.bible_next_chapter()}>
          <Button
            className={cls.chapterNavigationButton}
            aria-label={m.bible_next_chapter()}
            disabled={!next}
            onClick={() => navigateTo(1)}
          >
            <Icon name="arrowRight" />
          </Button>
        </Tooltip>
      </div>
    </nav>
  );
}
