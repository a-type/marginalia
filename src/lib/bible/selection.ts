export function parseVerseSelection(value: unknown): number[] {
  if (typeof value !== 'string') return [];

  return [
    ...new Set(
      value
        .split(',')
        .map(Number)
        .filter((verse) => Number.isInteger(verse) && verse > 0),
    ),
  ].sort((left, right) => left - right);
}

export function formatVerseSelection(verses: readonly number[]): string {
  return [...new Set(verses)].sort((left, right) => left - right).join(',');
}
