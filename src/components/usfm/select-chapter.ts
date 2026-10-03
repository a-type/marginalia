import type { USFMDocument } from './types';

export function selectChapter(
  document: USFMDocument,
  chapter: number | undefined,
): USFMDocument {
  if (chapter === undefined) return document;

  return {
    ...document,
    children: document.children.filter((node) => {
      if (node.type !== 'marker') return true;
      if (node.category === 'chapter') return Number(node.argument) === chapter;
      if (node.category === 'title' || node.category === 'heading')
        return chapter === 1;
      return true;
    }),
  };
}
