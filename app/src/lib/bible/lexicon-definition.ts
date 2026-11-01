import { bookNames, resolveBookName } from './book-names';
import type { BibleReference } from './location';
import { parseScriptureCitation } from './location';

export interface LexiconReference {
  label: string;
  passage: BibleReference;
}

export type LexiconDefinitionPart =
  | { type: 'text'; text: string }
  | { type: 'reference'; reference: LexiconReference };

const singleChapterBooks = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);
const passagePattern = String.raw`[1-9]\d*(?::\[?[1-9]\d*[a-f]?\]?)?(?:[-–][1-9]\d*(?::[1-9]\d*)?[a-f]?)?(?![\w:])`;
const citationPattern = new RegExp(
  String.raw`\b((?:III\s*|II\s*|I\s*|[1-4]\s*)?[A-Za-z]{2,12})[.\s]+(${passagePattern})`,
  'g',
);
const continuationPattern = new RegExp(
  String.raw`^([,\s]+)(${passagePattern})`,
);
const nextCitationPattern = new RegExp(`^${citationPattern.source}`);

function reference(
  bookId: string,
  chapter: number,
  value: string,
): LexiconReference | undefined {
  const passage = parseScriptureCitation(
    `${bookId} ${value.includes(':') ? value : `${chapter}:${value}`}`,
  );
  if (!passage) return undefined;
  return {
    label: `${bookNames[bookId][0]} ${passage.chapter}:${passage.verses}`,
    passage,
  };
}

/** Expand the lexicon's abbreviated citations without interpreting prose numbers. */
export function parseLexiconDefinition(definition: string) {
  return definition
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const indented = paragraph.startsWith('__');
      const text = paragraph.replace(/^_+\s*/, '');
      const parts: LexiconDefinitionPart[] = [];
      let cursor = 0;
      let previousBook: string | undefined;

      for (const match of text.matchAll(citationPattern)) {
        if (match.index < cursor) continue;
        const name = match[1]
          .replace(/^(III|II|I)(?=\s|[A-Z])\s*/, (roman) =>
            String(roman.trim().length),
          )
          .replace(/^([123])Jhn$/, '$1John');
        const bookId =
          name === 'Jn' && previousBook?.endsWith('JN')
            ? previousBook
            : resolveBookName(
                name === 'Ju' ? 'JUD' : name === 'Jn' ? 'John' : name,
              );
        if (!bookId) continue;
        const value = match[2];
        if (!value.includes(':') && !singleChapterBooks.has(bookId)) continue;
        let chapter = value.includes(':') ? Number(value.split(':')[0]) : 1;
        const first = reference(bookId, chapter, value);
        if (!first) continue;

        const between = text.slice(cursor, match.index);
        if (between) parts.push({ type: 'text', text: between });
        parts.push({ type: 'reference', reference: first });
        cursor = match.index + match[0].length;
        previousBook = bookId;

        let continuation: RegExpExecArray | null;
        while ((continuation = continuationPattern.exec(text.slice(cursor)))) {
          if (
            nextCitationPattern.test(
              text.slice(cursor + continuation[1].length),
            )
          ) {
            break;
          }
          const next = reference(bookId, chapter, continuation[2]);
          if (!next) break;
          parts.push({ type: 'text', text: continuation[1] });
          parts.push({ type: 'reference', reference: next });
          chapter = next.passage.chapter;
          cursor += continuation[0].length;
        }
      }
      const remaining = text.slice(cursor);
      if (remaining) parts.push({ type: 'text', text: remaining });
      return { indented, parts };
    });
}
