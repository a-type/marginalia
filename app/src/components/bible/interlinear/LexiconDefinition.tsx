import { clsx } from '@a-type/ui';
import { parseLexiconDefinition } from '../../../lib/bible/lexicon-definition';
import { LexiconReferenceItem } from './LexiconReferenceItem';
import cls from './LexiconDefinition.module.css';

export function LexiconDefinition({ definition }: { definition: string }) {
  const paragraphs = parseLexiconDefinition(definition);
  return (
    <div className={cls.definition} lang="en">
      {paragraphs.map(({ indented, parts }, paragraphIndex) => (
        <p
          key={paragraphIndex}
          className={clsx(cls.paragraph, indented && cls.indented)}
        >
          {parts.map((part, partIndex) =>
            part.type === 'text' ? (
              part.text
            ) : (
              <LexiconReferenceItem
                key={partIndex}
                reference={part.reference}
              />
            ),
          )}
        </p>
      ))}
    </div>
  );
}
