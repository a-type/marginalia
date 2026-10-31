import { marginsbible } from '@marginsbible/atproto/lexicons';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { rebuildIndex } from './rebuild.ts';
import { createIndexerServer } from './server.ts';
import { IndexStore } from './store.ts';

const Annotation = marginsbible.annotation;
const Follow = marginsbible.follow;

afterEach(() => vi.restoreAllMocks());

it('serves ingestion, rebuild, and caller-scoped chapter reads over HTTP', async () => {
  const store = new IndexStore(':memory:');
  const server = createIndexerServer(store);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const input = { callerDid: 'did:plc:me', bookId: 'GEN', chapter: 1 };
  const record = {
    uri: `at://did:plc:me/${Annotation.$nsid}/key`,
    collection: Annotation.$nsid,
    record: {
      $type: Annotation.$nsid,
      verses: [{ id: 'GEN/1:1' }],
      comment: 'A comment with Unicode: \u00e9',
      createdAt: '2026-10-29T12:00:00.000Z',
    },
  };
  try {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post('/annotations/chapter', input)).status).toBe(503);
    expect((await post('/events', {})).status).toBe(400);

    const originalFetch = globalThis.fetch;
    const exportCalls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, options) => {
      if (String(url).startsWith('http://happyview.test/')) {
        const requestUrl = new URL(String(url));
        exportCalls.push(requestUrl.search);
        expect(options?.headers).toEqual({
          authorization: 'Bearer test-admin-key',
        });
        const collection = requestUrl.searchParams.get('collection');
        return Promise.resolve(
          Response.json(
            collection === Follow.$nsid
              ? { records: [] }
              : requestUrl.searchParams.has('cursor')
                ? { records: [] }
                : { records: [record], cursor: 'next-page' },
          ),
        );
      }
      return originalFetch(url, options);
    });
    await rebuildIndex({
      happyviewUrl: 'http://happyview.test/api',
      adminKey: 'test-admin-key',
      indexerUrl: baseUrl,
    });
    expect(exportCalls).toHaveLength(3);
    expect(await (await post('/annotations/chapter', input)).json()).toEqual({
      records: [{ ...record.record, uri: record.uri }],
    });
    expect(
      await (
        await post('/annotations/chapter', {
          ...input,
          callerDid: 'did:plc:other',
        })
      ).json(),
    ).toEqual({ records: [] });
    expect(
      (await post('/events', { ...record, action: 'delete' })).status,
    ).toBe(200);
    expect(await (await post('/annotations/chapter', input)).json()).toEqual({
      records: [],
    });
    expect(errorLog).toHaveBeenCalledTimes(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  }
});

it.each(['failed export', 'repeated cursor'])(
  'does not publish an incomplete rebuild after a %s',
  async (failure) => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      if (path === '/rebuild/start') {
        return Promise.resolve(
          Response.json({ id: '00000000-0000-4000-8000-000000000001' }),
        );
      }
      if (path === '/api/admin/records') {
        return Promise.resolve(
          failure === 'failed export'
            ? new Response('Export unavailable', { status: 503 })
            : Response.json({ records: [], cursor: 'repeated' }),
        );
      }
      return Promise.resolve(Response.json({ ok: true }));
    });
    await expect(
      rebuildIndex({
        happyviewUrl: 'http://happyview.test/api',
        adminKey: 'test-key',
        indexerUrl: 'http://indexer.test',
      }),
    ).rejects.toThrow(
      failure === 'failed export' ? 'Export unavailable' : 'repeated cursor',
    );
    expect(calls).not.toContain('/rebuild/finish');
  },
);
