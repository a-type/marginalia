import { isValidDid } from '@atproto/syntax';
import { marginsbible } from '@marginsbible/atproto/lexicons';
import {
  isBookId,
  isValidVerseId,
  parseVerseId,
} from '@marginsbible/bible/verse';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const Annotation = marginsbible.annotation;
const Follow = marginsbible.follow;

export const collections: string[] = [Annotation.$nsid, Follow.$nsid];

export const eventSchema = z
  .object({
    uri: z.string(),
    collection: z.enum([Annotation.$nsid, Follow.$nsid]),
    action: z.enum(['create', 'update', 'delete']),
    record: z.unknown().optional(),
  })
  .superRefine((event, context) => {
    const parts = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(event.uri);
    if (!parts || !isValidDid(parts[1]) || parts[2] !== event.collection) {
      context.addIssue({ code: 'custom', message: 'Invalid record URI' });
    }
    if (event.action !== 'delete' && event.record === undefined) {
      context.addIssue({ code: 'custom', message: 'Missing record' });
    }
  });

export const chapterQuerySchema = z.object({
  callerDid: z.string().refine(isValidDid, 'Invalid caller DID'),
  bookId: z.string().refine(isBookId, 'Invalid book ID'),
  chapter: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

type RecordEvent = z.infer<typeof eventSchema>;

export class IndexStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS annotations (
        uri TEXT PRIMARY KEY,
        author_did TEXT NOT NULL,
        created_at TEXT NOT NULL,
        record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS annotations_by_author
        ON annotations(author_did, created_at DESC, uri DESC);
      CREATE TABLE IF NOT EXISTS annotation_chapters (
        book_id TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        author_did TEXT NOT NULL,
        annotation_uri TEXT NOT NULL REFERENCES annotations(uri) ON DELETE CASCADE,
        PRIMARY KEY(book_id, chapter, author_did, annotation_uri)
      );
      CREATE INDEX IF NOT EXISTS chapters_by_annotation
        ON annotation_chapters(annotation_uri);
      CREATE TABLE IF NOT EXISTS follows (
        uri TEXT PRIMARY KEY,
        author_did TEXT NOT NULL,
        subject_did TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS follows_by_author
        ON follows(author_did, subject_did);
      CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        ready INTEGER NOT NULL DEFAULT 0,
        rebuild_id TEXT,
        rebuild_dirty INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO state(id) VALUES (1);
      CREATE TABLE IF NOT EXISTS rebuild_records (
        uri TEXT PRIMARY KEY,
        event TEXT NOT NULL
      );
    `);
  }

  get ready() {
    return this.db.prepare('SELECT ready FROM state').get()?.ready === 1;
  }

  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  ingest(input: unknown) {
    const event = eventSchema.parse(input);
    this.transaction(() => {
      this.apply(event);
      this.db
        .prepare(
          'UPDATE state SET rebuild_dirty = 1 WHERE rebuild_id IS NOT NULL',
        )
        .run();
    });
  }

  private apply(event: RecordEvent) {
    const authorDid = event.uri.slice(5).split('/')[0];
    if (event.collection === Follow.$nsid) {
      this.db.prepare('DELETE FROM follows WHERE uri = ?').run(event.uri);
      if (event.action === 'delete') return;
      const parsed = Follow.$safeParse(event.record);
      if (!parsed.success) {
        console.warn('Excluding invalid follow from index', event.uri, parsed);
        return;
      }
      this.db
        .prepare('INSERT INTO follows VALUES (?, ?, ?)')
        .run(event.uri, authorDid, parsed.value.subject);
      return;
    }

    this.db.prepare('DELETE FROM annotations WHERE uri = ?').run(event.uri);
    if (event.action === 'delete') return;
    const parsed = Annotation.$safeParse(event.record);
    if (!parsed.success) {
      console.warn(
        'Excluding invalid annotation from index',
        event.uri,
        parsed,
      );
      return;
    }
    const record = parsed.value;
    if (!record.comment.trim()) {
      console.warn('Excluding empty annotation from index', event.uri);
      return;
    }
    this.db
      .prepare('INSERT INTO annotations VALUES (?, ?, ?, ?)')
      .run(
        event.uri,
        authorDid,
        record.createdAt,
        JSON.stringify(event.record),
      );
    const insertChapter = this.db.prepare(
      'INSERT OR IGNORE INTO annotation_chapters VALUES (?, ?, ?, ?)',
    );
    for (const verse of record.verses) {
      if (!isValidVerseId(verse.id)) {
        console.warn('Excluding invalid annotation verse', event.uri, verse.id);
        continue;
      }
      const { bookId, chapter } = parseVerseId(verse.id);
      if (!Number.isSafeInteger(chapter)) {
        console.warn(
          'Excluding unsafe annotation chapter',
          event.uri,
          verse.id,
        );
        continue;
      }
      insertChapter.run(bookId, chapter, authorDid, event.uri);
    }
  }

  listChapter(input: unknown) {
    const query = chapterQuerySchema.parse(input);
    if (!this.ready) throw new IndexNotReadyError();
    // Keep visible authors outside the chapter lookup so unrelated authors'
    // documents are never loaded, even in a heavily annotated chapter.
    const rows = this.db
      .prepare(
        `WITH visible_authors(did) AS (
           SELECT ?
           UNION
           SELECT subject_did FROM follows WHERE author_did = ?
         )
         SELECT a.uri, a.record
         FROM visible_authors v
         CROSS JOIN annotation_chapters c
           ON c.book_id = ? AND c.chapter = ? AND c.author_did = v.did
         JOIN annotations a ON a.uri = c.annotation_uri
         ORDER BY a.created_at DESC, a.uri ASC`,
      )
      .all(query.callerDid, query.callerDid, query.bookId, query.chapter);
    return {
      records: rows.map((row) => {
        if (typeof row.record !== 'string' || typeof row.uri !== 'string') {
          throw new Error('Invalid indexed annotation');
        }
        const record: unknown = JSON.parse(row.record);
        return { ...Annotation.$parse(record), uri: row.uri };
      }),
    };
  }

  startRebuild() {
    const id = randomUUID();
    this.transaction(() => {
      this.db.exec('DELETE FROM rebuild_records;');
      this.db
        .prepare('UPDATE state SET rebuild_id = ?, rebuild_dirty = 0')
        .run(id);
    });
    return id;
  }

  private checkRebuild(id: string) {
    if (
      this.db.prepare('SELECT rebuild_id FROM state').get()?.rebuild_id !== id
    ) {
      throw new RebuildConflictError();
    }
  }

  stageRebuild(id: string, inputs: unknown[]) {
    const events = inputs.map((input) => eventSchema.parse(input));
    this.transaction(() => {
      this.checkRebuild(id);
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO rebuild_records VALUES (?, ?)',
      );
      for (const event of events) insert.run(event.uri, JSON.stringify(event));
    });
  }

  finishRebuild(id: string) {
    this.transaction(() => {
      this.checkRebuild(id);
      if (
        this.db.prepare('SELECT rebuild_dirty FROM state').get()?.rebuild_dirty
      ) {
        throw new RebuildConflictError(
          'Records changed during the offset-paginated HappyView export. Retry with ingestion and backfills paused.',
        );
      }
      this.db.exec('DELETE FROM annotations; DELETE FROM follows;');
      for (const row of this.db
        .prepare('SELECT event FROM rebuild_records')
        .iterate()) {
        if (typeof row.event !== 'string')
          throw new Error('Invalid staged event');
        this.apply(eventSchema.parse(JSON.parse(row.event)));
      }
      this.db.exec(`
        DELETE FROM rebuild_records;
        UPDATE state SET ready = 1, rebuild_id = NULL;
      `);
    });
  }

  close() {
    this.db.close();
  }
}

export class IndexNotReadyError extends Error {
  constructor() {
    super('Annotation index requires an initial rebuild');
  }
}

export class RebuildConflictError extends Error {
  constructor(message = 'Rebuild was superseded or already completed') {
    super(message);
  }
}
