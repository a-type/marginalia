import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const TOP_LIMIT = 10;

export interface IndexStats {
  database: { path: string; bytes: number; walBytes: number };
  state: {
    ready: boolean;
    rebuildInProgress: boolean;
    rebuildDirty: boolean;
    stagedRebuildRecords: number;
  };
  annotations: {
    total: number;
    authors: number;
    chapterMemberships: number;
    chapters: number;
    books: number;
    oldestCreatedAt: string | null;
    newestCreatedAt: string | null;
    createdLastDay: number;
    createdLastWeek: number;
    createdLastMonth: number;
    topBooks: Array<{ bookId: string; annotations: number }>;
    topChapters: Array<{
      bookId: string;
      chapter: number;
      annotations: number;
    }>;
    topAuthors: Array<{ did: string; annotations: number }>;
  };
  follows: {
    total: number;
    followers: number;
    followedAuthors: number;
    topFollowed: Array<{ did: string; followers: number }>;
  };
}

function fileBytes(path: string) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function readIndexStats(path: string): IndexStats {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const value = (sql: string, ...params: Array<string | number>) => {
      const row = db.prepare(sql).get(...params);
      return row ? Object.values(row)[0] : undefined;
    };
    const count = (sql: string, ...params: Array<string | number>) =>
      Number(value(sql, ...params) ?? 0);
    const text = (sql: string) => {
      const result = value(sql);
      return typeof result === 'string' ? result : null;
    };
    const createdSince = (modifier: string) =>
      count(
        `SELECT COUNT(*) FROM annotations
         WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`,
        modifier,
      );

    const state = db
      .prepare('SELECT ready, rebuild_id, rebuild_dirty FROM state')
      .get();

    return {
      database: {
        path,
        bytes: fileBytes(path),
        walBytes: fileBytes(`${path}-wal`),
      },
      state: {
        ready: state?.ready === 1,
        rebuildInProgress: state?.rebuild_id != null,
        rebuildDirty: state?.rebuild_dirty === 1,
        stagedRebuildRecords: count('SELECT COUNT(*) FROM rebuild_records'),
      },
      annotations: {
        total: count('SELECT COUNT(*) FROM annotations'),
        authors: count('SELECT COUNT(DISTINCT author_did) FROM annotations'),
        chapterMemberships: count('SELECT COUNT(*) FROM annotation_chapters'),
        chapters: count(
          'SELECT COUNT(*) FROM (SELECT DISTINCT book_id, chapter FROM annotation_chapters)',
        ),
        books: count('SELECT COUNT(DISTINCT book_id) FROM annotation_chapters'),
        oldestCreatedAt: text('SELECT MIN(created_at) FROM annotations'),
        newestCreatedAt: text('SELECT MAX(created_at) FROM annotations'),
        createdLastDay: createdSince('-1 day'),
        createdLastWeek: createdSince('-7 days'),
        createdLastMonth: createdSince('-30 days'),
        topBooks: db
          .prepare(
            `SELECT book_id, COUNT(DISTINCT annotation_uri) AS n
             FROM annotation_chapters
             GROUP BY book_id ORDER BY n DESC, book_id LIMIT ?`,
          )
          .all(TOP_LIMIT)
          .map((row) => ({
            bookId: String(row.book_id),
            annotations: Number(row.n),
          })),
        topChapters: db
          .prepare(
            `SELECT book_id, chapter, COUNT(*) AS n
             FROM annotation_chapters
             GROUP BY book_id, chapter ORDER BY n DESC, book_id, chapter LIMIT ?`,
          )
          .all(TOP_LIMIT)
          .map((row) => ({
            bookId: String(row.book_id),
            chapter: Number(row.chapter),
            annotations: Number(row.n),
          })),
        topAuthors: db
          .prepare(
            `SELECT author_did, COUNT(*) AS n FROM annotations
             GROUP BY author_did ORDER BY n DESC, author_did LIMIT ?`,
          )
          .all(TOP_LIMIT)
          .map((row) => ({
            did: String(row.author_did),
            annotations: Number(row.n),
          })),
      },
      follows: {
        total: count('SELECT COUNT(*) FROM follows'),
        followers: count('SELECT COUNT(DISTINCT author_did) FROM follows'),
        followedAuthors: count(
          'SELECT COUNT(DISTINCT subject_did) FROM follows',
        ),
        topFollowed: db
          .prepare(
            `SELECT subject_did, COUNT(DISTINCT author_did) AS n FROM follows
             GROUP BY subject_did ORDER BY n DESC, subject_did LIMIT ?`,
          )
          .all(TOP_LIMIT)
          .map((row) => ({
            did: String(row.subject_did),
            followers: Number(row.n),
          })),
      },
    };
  } finally {
    db.close();
  }
}

function formatBytes(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
}

export function formatIndexStats(stats: IndexStats) {
  const { database, state, annotations, follows } = stats;
  const lines = [
    'Annotation index stats',
    '',
    `Database:   ${database.path}`,
    `Size:       ${formatBytes(database.bytes)} (+ ${formatBytes(database.walBytes)} WAL)`,
    `Ready:      ${state.ready ? 'yes' : 'no (needs an initial rebuild)'}`,
    `Rebuild:    ${
      state.rebuildInProgress
        ? `in progress, ${state.stagedRebuildRecords} records staged${
            state.rebuildDirty ? ' (dirty; will conflict)' : ''
          }`
        : 'idle'
    }`,
    '',
    'Annotations',
    `  Total:              ${annotations.total}`,
    `  Authors:            ${annotations.authors}`,
    `  Books / chapters:   ${annotations.books} / ${annotations.chapters}`,
    `  Chapter links:      ${annotations.chapterMemberships}`,
    `  Oldest createdAt:   ${annotations.oldestCreatedAt ?? '-'}`,
    `  Newest createdAt:   ${annotations.newestCreatedAt ?? '-'}`,
    `  Created 1d/7d/30d:  ${annotations.createdLastDay} / ${annotations.createdLastWeek} / ${annotations.createdLastMonth}`,
  ];
  const section = (title: string, rows: string[]) => {
    if (rows.length) lines.push('', title, ...rows.map((row) => `  ${row}`));
  };
  section(
    'Top books',
    annotations.topBooks.map((row) => `${row.annotations}\t${row.bookId}`),
  );
  section(
    'Top chapters',
    annotations.topChapters.map(
      (row) => `${row.annotations}\t${row.bookId} ${row.chapter}`,
    ),
  );
  section(
    'Top authors',
    annotations.topAuthors.map((row) => `${row.annotations}\t${row.did}`),
  );
  lines.push(
    '',
    'Follows',
    `  Total:              ${follows.total}`,
    `  Followers:          ${follows.followers}`,
    `  Followed authors:   ${follows.followedAuthors}`,
  );
  section(
    'Most followed',
    follows.topFollowed.map((row) => `${row.followers}\t${row.did}`),
  );
  return lines.join('\n');
}
