import { describe, expect, it } from 'vitest';
import { bookNames, resolveBookName } from './book-names';

describe('Bible book aliases', () => {
  it('resolves every configured name and code without collisions', () => {
    for (const [id, names] of Object.entries(bookNames)) {
      expect(resolveBookName(id)).toBe(id);
      for (const name of names) {
        expect(resolveBookName(name)).toBe(id);
      }
    }
  });

  it.each([
    ['Song of Solomon', 'SNG'],
    ['Song of Songs', 'SNG'],
    ['  song   OF songs ', 'SNG'],
    ['Psalm', 'PSA'],
    ['Psalms', 'PSA'],
    ['Ps.', 'PSA'],
    ['II Corinthians', '2CO'],
    ['Second Corinthians', '2CO'],
    ['1Corinthians', '1CO'],
    ['iii John', '3JN'],
    ['Ecclesiasticus', 'SIR'],
    ['Wisdom of Solomon', 'WIS'],
    ['Acts of the Apostles', 'ACT'],
  ])('maps %s to %s', (name, id) => {
    expect(resolveBookName(name)).toBe(id);
  });

  it.each(['', 'Unknown', 'constructor', '__proto__'])(
    'does not guess unknown name %s',
    (name) => {
      expect(resolveBookName(name)).toBeUndefined();
    },
  );
});
