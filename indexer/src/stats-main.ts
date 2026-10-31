import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { formatIndexStats, readIndexStats } from './stats.ts';

const { values } = parseArgs({
  options: { json: { type: 'boolean', default: false } },
});

const path = process.env.INDEXER_DATABASE_PATH ?? '/data/annotations.sqlite';
if (!existsSync(path)) {
  console.error(
    `No annotation index at ${path}. Set INDEXER_DATABASE_PATH to the indexer's database.`,
  );
  process.exit(1);
}

const stats = readIndexStats(path);
console.info(
  values.json ? JSON.stringify(stats, null, 2) : formatIndexStats(stats),
);
