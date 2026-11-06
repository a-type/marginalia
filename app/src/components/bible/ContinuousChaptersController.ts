import type { BibleLocation } from '../../lib/bible/location';
import { getAdjacentChapter } from '../../lib/bible/navigation';
import type { TranslationManifest } from '../../lib/bible/source';
import { getTranslationBook } from '../../lib/bible/source';

export const CHAPTER_BUFFER = 3;

type Elements = {
  viewport: HTMLDivElement;
  content: HTMLDivElement;
  before: HTMLDivElement;
  after: HTMLDivElement;
};

type Snapshot = {
  active: BibleLocation;
  initialPositionSettled: boolean;
  scrubLocation: BibleLocation | null;
};

export type ReadingScrollPosition = {
  position: BibleLocation;
  scrollProgress: number;
};

export function getChapterWindow(
  manifest: TranslationManifest,
  active: BibleLocation,
) {
  const chapters = [active];
  for (const direction of [-1, 1] as const) {
    let chapter = active;
    for (let i = 0; i < CHAPTER_BUFFER; i++) {
      const adjacent = getAdjacentChapter(manifest, chapter, direction);
      if (!adjacent) break;
      if (direction === -1) chapters.unshift(adjacent);
      else chapters.push(adjacent);
      chapter = adjacent;
    }
  }
  const first = chapters[0];
  const before =
    manifest.books
      .slice(
        0,
        manifest.books.findIndex((book) => book.id === first.bookId),
      )
      .reduce((total, book) => total + book.chapters, 0) +
    first.chapter -
    1;
  const total = manifest.books.reduce((sum, book) => sum + book.chapters, 0);
  return { chapters, before, after: total - before - chapters.length, total };
}

export class ContinuousChaptersController {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private elements: Elements | undefined;
  private chapters: HTMLElement[] = [];
  private window: ReturnType<typeof getChapterWindow>;
  private observer: ResizeObserver | undefined;
  private averageHeight = 0;
  private anchor: { key: string; top: number } | null = null;
  private pendingProgress: number | null;
  private frame: number | null = null;
  private pointerId: number | null = null;
  private buffersNeedUpdate = false;

  constructor(
    private manifest: TranslationManifest,
    location: BibleLocation,
    readingPosition: BibleLocation | undefined,
    scrollProgress: number | undefined,
  ) {
    const book = readingPosition
      ? getTranslationBook(manifest, readingPosition.bookId)
      : undefined;
    const active =
      readingPosition &&
      book &&
      readingPosition.chapter >= 1 &&
      readingPosition.chapter <= book.chapters
        ? readingPosition
        : location;
    this.snapshot = {
      active,
      initialPositionSettled: false,
      scrubLocation: null,
    };
    this.window = getChapterWindow(manifest, active);
    this.pendingProgress = scrollProgress ?? 0;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private setActive(active: BibleLocation, settled = true) {
    if (
      this.snapshot.active.bookId !== active.bookId ||
      this.snapshot.active.chapter !== active.chapter ||
      this.snapshot.initialPositionSettled !== settled
    ) {
      this.update({ active, initialPositionSettled: settled });
    }
  }

  commit(elements: Elements, manifest: TranslationManifest) {
    this.elements = elements;
    this.manifest = manifest;
    this.window = getChapterWindow(this.manifest, this.snapshot.active);
    this.chapters = [
      ...elements.content.querySelectorAll<HTMLElement>(
        '[data-reader-chapter]',
      ),
    ];
    this.updateBuffers();
    if (this.anchor) {
      const element = this.chapters.find(
        (entry) => entry.dataset.readerChapter === this.anchor?.key,
      );
      if (element)
        elements.viewport.scrollTop +=
          element.getBoundingClientRect().top - this.anchor.top;
    }
    if (!this.snapshot.initialPositionSettled) {
      const target = this.findChapter(this.snapshot.active);
      if (target?.dataset.readerChapterLoaded === 'true') {
        const bounds = target.getBoundingClientRect();
        elements.viewport.scrollTop +=
          bounds.top +
          bounds.height * (this.pendingProgress ?? 0) -
          elements.viewport.getBoundingClientRect().top;
        this.pendingProgress = null;
        this.update({ initialPositionSettled: true });
      }
    }
    this.anchor = null;
    this.observer = new ResizeObserver(() => this.updateBuffers());
    this.chapters.forEach((element) => this.observer?.observe(element));
    this.observer.observe(elements.viewport);
  }

  prepareForCommit() {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.anchor || !this.elements) return;
    const visible = this.snapshot.initialPositionSettled
      ? this.getMostVisibleChapter()
      : this.findChapter(this.snapshot.active);
    if (visible) {
      this.anchor = {
        key: visible.dataset.readerChapter ?? '',
        top: visible.getBoundingClientRect().top,
      };
    }
  }

  destroy() {
    this.observer?.disconnect();
    this.cancelFrame();
    this.elements = undefined;
  }

  private updateBuffers() {
    const elements = this.elements;
    if (!elements) return;
    if (this.pointerId !== null) {
      this.buffersNeedUpdate = true;
      return;
    }
    this.buffersNeedUpdate = false;
    const loaded = this.chapters.filter(
      (element) => element.dataset.readerChapterLoaded === 'true',
    );
    if (loaded.length) {
      const height = loaded.reduce(
        (sum, element) => sum + element.getBoundingClientRect().height,
        0,
      );
      if (height > 0) this.averageHeight = height / loaded.length;
    }
    if (this.averageHeight <= 0)
      this.averageHeight = elements.viewport.clientHeight * 2;
    const visible = this.snapshot.initialPositionSettled
      ? this.getMostVisibleChapter()
      : undefined;
    const top = visible?.getBoundingClientRect().top;
    elements.before.style.height = `${this.window.before * this.averageHeight}px`;
    elements.after.style.height = `${this.window.after * this.averageHeight}px`;
    if (this.window.after === 0) {
      const last = this.chapters.at(-1);
      const remaining = last
        ? elements.content.getBoundingClientRect().bottom -
          last.getBoundingClientRect().top -
          elements.after.getBoundingClientRect().height
        : elements.viewport.clientHeight;
      elements.after.style.minHeight = `${Math.max(0, elements.viewport.clientHeight - remaining)}px`;
    } else {
      elements.after.style.minHeight = '';
    }
    if (visible && top !== undefined) {
      const adjustment = visible.getBoundingClientRect().top - top;
      if (adjustment !== 0) elements.viewport.scrollTop += adjustment;
    }
  }

  onScroll = () => {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.pointerId !== null) {
        const estimate = this.getEstimatedLocation();
        if (
          estimate &&
          (this.snapshot.scrubLocation?.bookId !== estimate.bookId ||
            this.snapshot.scrubLocation.chapter !== estimate.chapter)
        )
          this.update({ scrubLocation: estimate });
        return;
      }
      if (!this.snapshot.initialPositionSettled || !this.elements) return;
      const visible = this.getMostVisibleChapter();
      const chapter = this.locationForElement(visible);
      if (chapter && visible) {
        this.anchor = {
          key: visible.dataset.readerChapter ?? '',
          top: visible.getBoundingClientRect().top,
        };
        this.setActive(chapter);
        return;
      }
      const estimate = this.getBufferOffset();
      if (!estimate) return;
      const target = this.getChapterAtIndex(estimate.index);
      if (!target) return;
      this.anchor = null;
      this.pendingProgress = estimate.progress;
      this.setActive(target, false);
    });
  };

  startScrubbing(pointerId: number) {
    if (this.pointerId !== null) return;
    this.cancelFrame();
    this.pointerId = pointerId;
    this.update({
      scrubLocation: this.getEstimatedLocation() ?? this.snapshot.active,
    });
  }

  finishScrubbing(pointerId: number) {
    if (this.pointerId !== pointerId) return;
    this.cancelFrame();
    const estimate = this.getEstimatedLocation();
    this.pointerId = null;
    this.update({ scrubLocation: null });
    if (this.buffersNeedUpdate) this.updateBuffers();
    if (estimate) this.goTo(estimate);
  }

  goTo = (chapter: BibleLocation) => {
    this.cancelFrame();
    this.anchor = null;
    this.pendingProgress = 0;
    const element = this.findChapter(chapter);
    const viewport = this.elements?.viewport;
    if (viewport && element) {
      viewport.scrollTop +=
        element.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top;
      this.anchor = {
        key: `${chapter.bookId}/${chapter.chapter}`,
        top: element.getBoundingClientRect().top,
      };
    }
    const loaded = element?.dataset.readerChapterLoaded === 'true';
    this.setActive(chapter, !!loaded);
  };

  getScrollPosition = (): ReadingScrollPosition | undefined => {
    if (
      !this.snapshot.initialPositionSettled ||
      this.pointerId !== null ||
      !this.elements
    )
      return undefined;
    const visible = this.getMostVisibleChapter();
    const position = this.locationForElement(visible);
    if (!visible || !position) return undefined;
    const bounds = visible.getBoundingClientRect();
    if (bounds.height <= 0) return undefined;
    return {
      position,
      scrollProgress:
        (this.elements.viewport.getBoundingClientRect().top - bounds.top) /
        bounds.height,
    };
  };

  private cancelFrame() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private findChapter(location: BibleLocation) {
    return this.chapters.find(
      (entry) =>
        entry.dataset.readerChapter ===
        `${location.bookId}/${location.chapter}`,
    );
  }

  private locationForElement(element: HTMLElement | undefined) {
    return this.window.chapters.find(
      (chapter) =>
        element?.dataset.readerChapter ===
        `${chapter.bookId}/${chapter.chapter}`,
    );
  }

  private getMostVisibleChapter() {
    if (!this.elements) return undefined;
    const bounds = this.elements.viewport.getBoundingClientRect();
    let mostVisible = 0;
    let result: HTMLElement | undefined;
    for (const element of this.chapters) {
      const rect = element.getBoundingClientRect();
      const visible = Math.max(
        0,
        Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top),
      );
      if (visible > mostVisible) {
        mostVisible = visible;
        result = element;
      }
    }
    return result;
  }

  private getBufferOffset() {
    if (!this.elements || this.averageHeight <= 0) return undefined;
    const top = this.elements.viewport.getBoundingClientRect().top;
    const before = this.elements.before.getBoundingClientRect();
    const after = this.elements.after.getBoundingClientRect();
    let offset: number;
    let start: number;
    if (top >= before.top && top < before.bottom) {
      offset = (top - before.top) / this.averageHeight;
      start = 0;
    } else if (top >= after.top && top < after.bottom) {
      offset = (top - after.top) / this.averageHeight;
      start = this.window.before + this.window.chapters.length;
    } else return undefined;
    const index = Math.floor(offset);
    return { index: start + index, progress: offset - index };
  }

  private getEstimatedLocation() {
    if (!this.elements || this.averageHeight <= 0) return undefined;
    const { viewport } = this.elements;
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    if (viewport.scrollTop <= 0) return this.getChapterAtIndex(0);
    if (maxScroll > 0 && viewport.scrollTop >= maxScroll - 1)
      return this.getChapterAtIndex(this.window.total - 1);
    const offset = this.getBufferOffset();
    return offset
      ? this.getChapterAtIndex(offset.index)
      : this.locationForElement(this.getMostVisibleChapter());
  }

  private getChapterAtIndex(index: number) {
    if (index < 0) return undefined;
    for (const book of this.manifest.books) {
      if (index < book.chapters) return { bookId: book.id, chapter: index + 1 };
      index -= book.chapters;
    }
    return undefined;
  }
}
