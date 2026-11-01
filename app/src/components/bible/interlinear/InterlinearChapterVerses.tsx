import { m } from '#/paraglide/messages';
import { Button } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import type { InterlinearSelectionGroup } from '../../../lib/bible/interlinear';
import { interlinearChapterQueryOptions } from '../../../queries/interlinear';
import { InterlinearVerse } from './InterlinearVerse';
import cls from './InterlinearContent.module.css';

export function InterlinearChapterVerses({
  group,
  englishOrder,
}: {
  group: InterlinearSelectionGroup;
  englishOrder: boolean;
}) {
  const query = useQuery(
    interlinearChapterQueryOptions(group.book, group.chapter),
  );

  if (query.isPending) {
    return <p role="status">{m.interlinear_loading()}</p>;
  }
  if (query.isError) {
    return (
      <div role="alert" className={cls.chapterStatus}>
        <p>{m.interlinear_error()}</p>
        <Button size="small" emphasis="light" onClick={() => query.refetch()}>
          {m.interlinear_retry()}
        </Button>
      </div>
    );
  }
  if (!query.data.available) {
    return (
      <div className={cls.chapter}>
        {group.verses.map(({ id }) => (
          <p key={id}>{m.interlinear_verse_unavailable({ verse: id })}</p>
        ))}
      </div>
    );
  }

  const verses = new Map(
    query.data.chapter.verses.map((verse) => [verse.verse, verse]),
  );
  return (
    <div className={cls.chapter}>
      {group.verses.map(({ id, verse }) => {
        const content = verses.get(verse);
        return content ? (
          <InterlinearVerse
            key={id}
            verseId={id}
            verse={content}
            englishOrder={englishOrder}
          />
        ) : (
          <p key={id}>{m.interlinear_verse_unavailable({ verse: id })}</p>
        );
      })}
    </div>
  );
}
