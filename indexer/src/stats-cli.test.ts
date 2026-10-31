import { marginsbible } from '@marginsbible/atproto/lexicons';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { IndexStore } from './store.ts';

const Annotation = marginsbible.annotation;
const Follow = marginsbible.follow;

let directory: string | undefined;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function runStats(path: string, ...args: string[]) {
  return spawnSync(process.execPath, ['src/stats-main.ts', ...args], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { PATH: process.env.PATH, INDEXER_DATABASE_PATH: path },
    encoding: 'utf8',
  });
}

it('summarizes a populated index without modifying it', () => {
  directory = mkdtempSync(join(tmpdir(), 'indexer-stats-'));
  const path = join(directory, 'index.sqlite');
  const store = new IndexStore(path);
  const id = store.startRebuild();
  const annotate = (did: string, key: string, verses: string[]) => ({
    uri: `at://${did}/${Annotation.$nsid}/${key}`,
    collection: Annotation.$nsid,
    action: 'create',
    record: {
      $type: Annotation.$nsid,
      verses: verses.map((verse) => ({ id: verse })),
      comment: 'A comment',
      createdAt: new Date().toISOString(),
    },
  });
  store.stageRebuild(id, [
    annotate('did:plc:a', 'one', ['GEN/1:1', 'GEN/2:1']),
    annotate('did:plc:a', 'two', ['GEN/1:2']),
    annotate('did:plc:b', 'three', ['JHN/3:16']),
    {
      uri: `at://did:plc:b/${Follow.$nsid}/follow`,
      collection: Follow.$nsid,
      action: 'create',
      record: {
        $type: Follow.$nsid,
        subject: 'did:plc:a',
        createdAt: new Date().toISOString(),
      },
    },
  ]);
  store.finishRebuild(id);
  store.close();

  const result = runStats(path, '--json');
  expect(result.status, result.stderr).toBe(0);
  const stats = JSON.parse(result.stdout);
  expect(stats.state).toMatchObject({ ready: true, rebuildInProgress: false });
  expect(stats.annotations).toMatchObject({
    total: 3,
    authors: 2,
    books: 2,
    chapters: 3,
    chapterMemberships: 4,
    createdLastDay: 3,
    topBooks: [
      { bookId: 'GEN', annotations: 2 },
      { bookId: 'JHN', annotations: 1 },
    ],
    topAuthors: [
      { did: 'did:plc:a', annotations: 2 },
      { did: 'did:plc:b', annotations: 1 },
    ],
  });
  expect(stats.follows).toMatchObject({
    total: 1,
    followers: 1,
    followedAuthors: 1,
    topFollowed: [{ did: 'did:plc:a', followers: 1 }],
  });

  const text = runStats(path);
  expect(text.status, text.stderr).toBe(0);
  expect(text.stdout).toContain('Ready:      yes');
  expect(text.stdout).toMatch(/Total:\s+3/);
});

it('fails clearly when the database is missing', () => {
  const result = runStats('/nonexistent/index.sqlite');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No annotation index at');
});
