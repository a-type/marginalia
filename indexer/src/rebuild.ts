import { z } from 'zod';
import { collections } from './store.ts';

const pageSchema = z.object({
  records: z.array(
    z.object({
      uri: z.string(),
      collection: z.string().refine((value) => collections.includes(value)),
      record: z.unknown(),
    }),
  ),
  cursor: z.string().optional(),
});

export async function rebuildIndex({
  happyviewUrl,
  adminKey,
  indexerUrl,
}: {
  happyviewUrl: string;
  adminKey: string;
  indexerUrl: string;
}) {
  async function post(path: string, body: unknown) {
    const response = await fetch(`${indexerUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(
        `Indexer ${path}: ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  }

  const { id } = z
    .object({ id: z.string().uuid() })
    .parse(await post('/rebuild/start', {}));
  let count = 0;
  for (const collection of collections) {
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const url = new URL(`${happyviewUrl.replace(/\/+$/, '')}/admin/records`);
      url.searchParams.set('collection', collection);
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${adminKey}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(
          `HappyView export: ${response.status} ${await response.text()}`,
        );
      }
      const page = pageSchema.parse(await response.json());
      await post('/rebuild/records', {
        id,
        events: page.records.map((record) => ({ ...record, action: 'create' })),
      });
      count += page.records.length;
      cursor = page.cursor;
      if (cursor && cursors.has(cursor)) {
        throw new Error('HappyView export returned a repeated cursor');
      }
      if (cursor) cursors.add(cursor);
    } while (cursor);
  }
  await post('/rebuild/finish', { id });
  console.info(`Rebuilt annotation index from ${count} records.`);
}
