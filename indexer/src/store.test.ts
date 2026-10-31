import { marginsbible } from '@marginsbible/atproto/lexicons';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IndexNotReadyError,
  IndexStore,
  RebuildConflictError,
} from './store.ts';

const Annotation = marginsbible.annotation;
const Follow = marginsbible.follow;

const me = 'did:plc:me';
const friend = 'did:plc:friend';
const stranger = 'did:plc:stranger';
const createdAt = '2026-10-29T12:00:00.000Z';

function annotation(
  authorDid = me,
  key = 'annotation',
  verses = ['GEN/1:1'],
  date = createdAt,
) {
  return {
    uri: `at://${authorDid}/${Annotation.$nsid}/${key}`,
    collection: Annotation.$nsid,
    action: 'create',
    record: {
      $type: Annotation.$nsid,
      verses: verses.map((id) => ({ id })),
      comment: 'A comment',
      createdAt: date,
    },
  };
}

function follow(subject = friend, key = 'follow') {
  return {
    uri: `at://${me}/${Follow.$nsid}/${key}`,
    collection: Follow.$nsid,
    action: 'create',
    record: { $type: Follow.$nsid, subject, createdAt },
  };
}

const stores: IndexStore[] = [];
function store(path = ':memory:') {
  const index = new IndexStore(path);
  stores.push(index);
  return index;
}

function ready(index: IndexStore) {
  index.finishRebuild(index.startRebuild());
}

function chapter(index: IndexStore, bookId = 'GEN', chapterNumber = 1) {
  return index
    .listChapter({ callerDid: me, bookId, chapter: chapterNumber })
    .records.map((record) => record.uri);
}

afterEach(() => {
  for (const index of stores.splice(0)) index.close();
  vi.restoreAllMocks();
});

describe('annotation index', () => {
  it('requires a completed initial rebuild, not merely an empty database', () => {
    const index = store();
    index.ingest(annotation());
    expect(() => chapter(index)).toThrow(IndexNotReadyError);
  });

  it('includes self and follows only, with exact membership in every referenced chapter', () => {
    const index = store();
    ready(index);
    const own = annotation(me, 'own', [
      'GEN/1:1',
      'GEN/1:2',
      'GEN/3:1',
      'EXO/2:1',
    ]);
    const followed = annotation(friend, 'friend', ['GEN/1:3']);
    index.ingest(own);
    index.ingest(followed);
    index.ingest(annotation(stranger));
    index.ingest(annotation(me, 'other-chapter', ['GEN/10:1']));
    expect(chapter(index)).toEqual([own.uri]);
    index.ingest(follow());
    index.ingest(follow(friend, 'duplicate-follow'));
    index.ingest(follow(me, 'self-follow'));
    expect(chapter(index)).toEqual([followed.uri, own.uri].sort());
    expect(chapter(index, 'GEN', 2)).toEqual([]);
    expect(chapter(index, 'GEN', 3)).toEqual([own.uri]);
    expect(chapter(index, 'EXO', 2)).toEqual([own.uri]);
  });

  it('replaces memberships on update and handles repeated writes/deletes', () => {
    const index = store();
    ready(index);
    const original = annotation();
    index.ingest(original);
    index.ingest(original);
    expect(chapter(index)).toEqual([original.uri]);
    index.ingest({
      ...annotation(me, 'annotation', ['GEN/2:1']),
      action: 'update',
    });
    expect(chapter(index)).toEqual([]);
    expect(chapter(index, 'GEN', 2)).toEqual([original.uri]);
    index.ingest({ ...original, action: 'delete', record: undefined });
    index.ingest({ ...original, action: 'delete', record: undefined });
    expect(chapter(index, 'GEN', 2)).toEqual([]);
  });

  it('applies follow updates and deletes before selecting annotations', () => {
    const index = store();
    ready(index);
    const record = annotation(friend);
    index.ingest(record);
    index.ingest(follow());
    expect(chapter(index)).toEqual([record.uri]);
    index.ingest({ ...follow(stranger), action: 'update' });
    expect(chapter(index)).toEqual([]);
    index.ingest(follow());
    index.ingest({ ...follow(), action: 'delete', record: undefined });
    expect(chapter(index)).toEqual([]);
  });

  it('rolls back the entire annotation update when a storage write fails', () => {
    const index = store();
    ready(index);
    const original = annotation();
    index.ingest(original);
    index.db.exec(`
      CREATE TRIGGER reject_chapter BEFORE INSERT ON annotation_chapters
      WHEN NEW.chapter = 2 BEGIN SELECT RAISE(ABORT, 'storage failure'); END;
    `);
    expect(() =>
      index.ingest(annotation(me, 'annotation', ['GEN/2:1'])),
    ).toThrow('storage failure');
    expect(chapter(index)).toEqual([original.uri]);
    expect(chapter(index, 'GEN', 2)).toEqual([]);
  });

  it('preserves newest-first ordering and ascending URI ties without truncation', () => {
    const index = store();
    ready(index);
    const records = Array.from({ length: 125 }, (_, i) =>
      annotation(me, `record-${String(i).padStart(3, '0')}`),
    );
    for (const record of records) index.ingest(record);
    const newest = annotation(
      me,
      'newest',
      ['GEN/1:1'],
      '2026-10-30T00:00:00.000Z',
    );
    index.ingest(newest);
    expect(chapter(index)).toEqual([
      newest.uri,
      ...records.map((record) => record.uri),
    ]);
  });

  it('reports and excludes invalid records, blank comments, and invalid verses', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const index = store();
    ready(index);
    const original = annotation();
    index.ingest(original);
    index.ingest({
      ...original,
      record: { ...original.record, comment: ' \n ' },
    });
    index.ingest({ ...original, record: { $type: Annotation.$nsid } });
    index.ingest(follow('not-a-did'));
    const mixed = annotation(me, 'mixed', ['bad', 'GEN/1:1']);
    index.ingest(mixed);
    expect(chapter(index)).toEqual([mixed.uri]);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(() => index.ingest({ ...original, uri: 'invalid' })).toThrow();
    expect(() =>
      index.listChapter({ callerDid: me, bookId: 'GEN', chapter: 0 }),
    ).toThrow();
  });

  it('atomically rebuilds and removes stale annotations and follows', () => {
    const index = store();
    ready(index);
    index.ingest(annotation(me, 'stale'));
    index.ingest(follow());
    const id = index.startRebuild();
    const added = annotation(me, 'added');
    index.stageRebuild(id, [added]);
    expect(chapter(index)).toEqual([annotation(me, 'stale').uri]);
    index.finishRebuild(id);
    expect(chapter(index)).toEqual([added.uri]);
    index.ingest(annotation(friend));
    expect(chapter(index)).toEqual([added.uri]);
  });

  it('rejects unstable exports without overwriting concurrent updates or deletes', () => {
    const index = store();
    ready(index);
    const old = annotation(me, 'updated');
    const deleted = annotation(me, 'deleted');
    index.ingest(old);
    index.ingest(deleted);
    const id = index.startRebuild();
    index.stageRebuild(id, [old, deleted]);
    const current = annotation(me, 'updated', ['GEN/2:1']);
    index.ingest(current);
    index.ingest({ ...deleted, action: 'delete', record: undefined });
    expect(() => index.finishRebuild(id)).toThrow('Records changed');
    expect(chapter(index)).toEqual([]);
    expect(chapter(index, 'GEN', 2)).toEqual([current.uri]);
    const retry = index.startRebuild();
    index.stageRebuild(retry, [current]);
    index.finishRebuild(retry);
    expect(chapter(index, 'GEN', 2)).toEqual([current.uri]);
  });

  it('rejects superseded rebuilds without damaging the live projection', () => {
    const index = store();
    ready(index);
    const record = annotation();
    index.ingest(record);
    const old = index.startRebuild();
    index.startRebuild();
    expect(() => index.finishRebuild(old)).toThrow(RebuildConflictError);
    expect(chapter(index)).toEqual([record.uri]);
  });

  it('persists records and readiness across restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'margins-indexer-'));
    try {
      const path = join(directory, 'index.sqlite');
      const first = new IndexStore(path);
      ready(first);
      first.ingest(annotation());
      first.close();
      const second = new IndexStore(path);
      try {
        expect(chapter(second)).toEqual([annotation().uri]);
      } finally {
        second.close();
      }
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('uses author and chapter index constraints before reading documents', () => {
    const index = store();
    const plan = index.db
      .prepare(
        `EXPLAIN QUERY PLAN
      WITH visible_authors(did) AS (
        SELECT ? UNION SELECT subject_did FROM follows WHERE author_did = ?
      )
      SELECT a.uri, a.record FROM visible_authors v
      CROSS JOIN annotation_chapters c
        ON c.book_id = ? AND c.chapter = ? AND c.author_did = v.did
      JOIN annotations a ON a.uri = c.annotation_uri
      ORDER BY a.created_at DESC, a.uri ASC
    `,
      )
      .all(me, me, 'GEN', 1);
    expect(plan.map((row) => row.detail).join('\n')).toContain(
      '(book_id=? AND chapter=? AND author_did=?)',
    );
  });
});
