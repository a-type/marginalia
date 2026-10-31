import type { BookId } from './verse';

export const bookNames: Readonly<Record<BookId, readonly string[]>> = {
  GEN: ['Genesis'],
  EXO: ['Exodus'],
  LEV: ['Leviticus'],
  NUM: ['Numbers'],
  DEU: ['Deuteronomy'],
  JOS: ['Joshua'],
  JDG: ['Judges'],
  RUT: ['Ruth'],
  '1SA': ['1 Samuel'],
  '2SA': ['2 Samuel'],
  '1KI': ['1 Kings'],
  '2KI': ['2 Kings'],
  '1CH': ['1 Chronicles'],
  '2CH': ['2 Chronicles'],
  EZR: ['Ezra'],
  NEH: ['Nehemiah'],
  EST: ['Esther'],
  JOB: ['Job'],
  PSA: ['Psalms', 'Psalm', 'Ps'],
  PRO: ['Proverbs'],
  ECC: ['Ecclesiastes', 'Qoheleth'],
  SNG: ['Song of Solomon', 'Song of Songs', 'Canticles'],
  ISA: ['Isaiah'],
  JER: ['Jeremiah'],
  LAM: ['Lamentations'],
  EZK: ['Ezekiel'],
  DAN: ['Daniel'],
  HOS: ['Hosea'],
  JOL: ['Joel'],
  AMO: ['Amos'],
  OBA: ['Obadiah'],
  JON: ['Jonah'],
  MIC: ['Micah'],
  NAM: ['Nahum'],
  HAB: ['Habakkuk'],
  ZEP: ['Zephaniah'],
  HAG: ['Haggai'],
  ZEC: ['Zechariah'],
  MAL: ['Malachi'],
  TOB: ['Tobit', 'Tobias'],
  JDT: ['Judith'],
  ESG: ['Greek Esther', 'Esther (Greek)', 'Additions to Esther'],
  WIS: ['Wisdom', 'Wisdom of Solomon', 'Book of Wisdom'],
  SIR: ['Sirach', 'Ecclesiasticus', 'Wisdom of Jesus son of Sirach'],
  BAR: ['Baruch'],
  LJE: ['Letter of Jeremiah', 'Epistle of Jeremiah'],
  S3Y: ['Song of the Three Young Men', 'Prayer of Azariah'],
  SUS: ['Susanna'],
  BEL: ['Bel and the Dragon'],
  '1MA': ['1 Maccabees'],
  '2MA': ['2 Maccabees'],
  '3MA': ['3 Maccabees'],
  '4MA': ['4 Maccabees'],
  '1ES': ['1 Esdras'],
  '2ES': ['2 Esdras'],
  MAN: ['Prayer of Manasseh'],
  PS2: ['Psalm 151'],
  MAT: ['Matthew'],
  MRK: ['Mark'],
  LUK: ['Luke'],
  JHN: ['John'],
  ACT: ['Acts', 'Acts of the Apostles'],
  ROM: ['Romans'],
  '1CO': ['1 Corinthians'],
  '2CO': ['2 Corinthians'],
  GAL: ['Galatians'],
  EPH: ['Ephesians'],
  PHP: ['Philippians'],
  COL: ['Colossians'],
  '1TH': ['1 Thessalonians'],
  '2TH': ['2 Thessalonians'],
  '1TI': ['1 Timothy'],
  '2TI': ['2 Timothy'],
  TIT: ['Titus'],
  PHM: ['Philemon'],
  HEB: ['Hebrews'],
  JAS: ['James'],
  '1PE': ['1 Peter'],
  '2PE': ['2 Peter'],
  '1JN': ['1 John'],
  '2JN': ['2 John'],
  '3JN': ['3 John'],
  JUD: ['Jude'],
  REV: ['Revelation', 'Revelations', 'Apocalypse'],
};

function normalizeBookName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/^(iii|ii|iv|i|first|second|third|fourth)\s+/, (prefix) => {
      const number = {
        i: 1,
        ii: 2,
        iii: 3,
        iv: 4,
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
      }[prefix.trim()];
      return `${number} `;
    })
    .replace(/\s+/g, '');
}

const bookIdsByName = new Map(
  Object.entries(bookNames).flatMap(([id, names]) =>
    [id, ...names].map((name) => [normalizeBookName(name), id] as const),
  ),
);

export function resolveBookName(name: string): BookId | undefined {
  return bookIdsByName.get(normalizeBookName(name));
}
