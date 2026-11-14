import { useState } from 'react';
import { m } from '#/paraglide/messages';
import { useDeveloperStatusBar } from '../settings/useDeveloperStatusBar';
import cls from './DeveloperStatusBar.module.css';

export function DeveloperStatusBar({ chapters }: { chapters: string[] }) {
  const [enabled] = useDeveloperStatusBar();
  return enabled ? <ChapterStatusBar chapters={chapters} /> : null;
}

function ChapterStatusBar({ chapters }: { chapters: string[] }) {
  const chapterKey = chapters.join(',');
  const [snapshot, setSnapshot] = useState<{
    chapterKey: string;
    loaded: string[];
    unloaded: string[];
    revision: number;
  }>({
    chapterKey,
    loaded: [],
    unloaded: [],
    revision: 0,
  });
  if (chapterKey !== snapshot.chapterKey) {
    const previous = snapshot.chapterKey.split(',').filter(Boolean);
    setSnapshot({
      chapterKey,
      loaded: chapters.filter((chapter) => !previous.includes(chapter)),
      unloaded: previous.filter((chapter) => !chapters.includes(chapter)),
      revision: snapshot.revision + 1,
    });
  }

  return (
    <output
      className={cls.root}
      aria-label={m.settings_developer_status_bar()}
      aria-live="off"
      data-developer-status-bar
    >
      <span data-loaded-chapters>
        {m.developer_chapters_loaded()} {chapters.join(', ') || '-'}
      </span>
      {snapshot.revision > 0 && (
        <span
          key={snapshot.revision}
          className={cls.change}
          data-chapter-change
        >
          {snapshot.loaded.length > 0 && (
            <span className="@mode-success">
              {m.developer_chapters_added()} +{snapshot.loaded.join(', +')}
            </span>
          )}
          {snapshot.unloaded.length > 0 && (
            <span className="@mode-attention">
              {m.developer_chapters_removed()} -{snapshot.unloaded.join(', -')}
            </span>
          )}
        </span>
      )}
    </output>
  );
}
