import { m } from '#/paraglide/messages';
import { Text } from '@a-type/ui';
import type {
  InterlinearVerse as InterlinearVerseData,
  InterlinearWord,
} from '../../../lib/bible/interlinear';
import type { VerseId } from '../../../lib/bible/verse';
import cls from './InterlinearContent.module.css';
import { LexiconDialog } from './LexiconDialog';

const languageAttributes = {
  hebrew: { lang: 'he', dir: 'rtl' as const },
  aramaic: { lang: 'arc', dir: 'rtl' as const },
  greek: { lang: 'el', dir: 'ltr' as const },
};

export function InterlinearVerse({
  verseId,
  verse,
  englishOrder,
}: {
  verseId: VerseId;
  verse: InterlinearVerseData;
  englishOrder: boolean;
}) {
  const words = [...verse.words].sort((left, right) =>
    englishOrder
      ? left.bsbPos - right.bsbPos || left.pos - right.pos
      : left.pos - right.pos,
  );
  const attributes = languageAttributes[words[0]?.language ?? 'greek'];

  return (
    <section className={cls.verse}>
      <h3>{verseId}</h3>
      <ol
        className={cls.words}
        dir={englishOrder ? 'ltr' : attributes.dir}
        aria-label={m.interlinear_words_for_verse({ verse: verseId })}
      >
        {words.map((word) => (
          <InterlinearWordView key={`${word.pos}-${word.bsbPos}`} word={word} />
        ))}
      </ol>
    </section>
  );
}

function InterlinearWordView({ word }: { word: InterlinearWord }) {
  const attributes = languageAttributes[word.language];
  return (
    <li className={cls.word}>
      <Text
        className={cls.original}
        lang={attributes.lang}
        dir={attributes.dir}
        bold
      >
        {word.text}
      </Text>
      <Text className={cls.transliteration} dir="ltr" emphasis="ambient" dim>
        {word.transliteration}
      </Text>
      <Text className={cls.strongs} dir="ltr" emphasis="ambient" dim>
        {word.strongs ? (
          <LexiconDialog strongsId={word.strongs} />
        ) : (
          <span role="img" aria-label={m.interlinear_strongs_missing()}>
            <span aria-hidden="true">—</span>
          </span>
        )}
      </Text>
      <Text className={cls.gloss} lang="en" dir="ltr">
        {word.gloss ?? (
          <span role="img" aria-label={m.interlinear_gloss_missing()}>
            <span aria-hidden="true">—</span>
          </span>
        )}
      </Text>
    </li>
  );
}
