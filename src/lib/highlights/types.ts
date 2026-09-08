export const highlightColors = [
  'lemon',
  'leek',
  'tomato',
  'blueberry',
] as const;

export type HighlightColor = (typeof highlightColors)[number];
