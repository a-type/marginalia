import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

async function runProvisioning(port, overrides = {}) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./provision-happyview.mjs', import.meta.url))],
    {
      env: {
        PATH: process.env.PATH,
        APP_URL: 'http://127.0.0.1:7654',
        HAPPYVIEW_BASE_URL: `http://127.0.0.1:${port}/api`,
        HAPPYVIEW_ADMIN_KEY: 'test-admin-key',
        ANNOTATION_INDEXER_URL:
          'http://annotation-indexer.railway.internal:3000',
        ...overrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const [code] = await once(child, 'close');
  return { code, output };
}

it('provisions private indexing hooks before backfill and preserves the chapter query target', async () => {
  const calls = [];
  const server = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    calls.push({ path: request.url, method: request.method, body });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/admin/settings/xrpc-proxy') {
      response.end(
        JSON.stringify({
          mode: 'open',
          nsids: [],
          routing: 'serviceproxy',
        }),
      );
    } else if (request.url === '/api/admin/api-clients') {
      response.end(JSON.stringify({ client_key: 'hvc_test_public_key' }));
    } else {
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  try {
    const { code, output } = await runProvisioning(port);
    expect(code, output).toBe(0);
    const scriptCalls = calls.filter(
      (call) => call.path === '/api/admin/scripts',
    );
    const hooks = scriptCalls.filter((call) =>
      call.body.id.startsWith('record.index:'),
    );
    expect(hooks.map((call) => call.body.id)).toEqual([
      'record.index:com.marginsbible.annotation',
      'record.index:com.marginsbible.follow',
    ]);
    const firstBackfill = calls.findIndex((call) => call.body?.backfill);
    for (const hook of hooks) {
      expect(calls.indexOf(hook)).toBeLessThan(firstBackfill);
    }
    const chapterQuery = scriptCalls.find(
      (call) =>
        call.body.id ===
        'xrpc.query:com.marginsbible.annotation.listForChapter',
    );
    for (const script of [...hooks, chapterQuery]) {
      expect(script.body.body).toContain(
        '"http://annotation-indexer.railway.internal:3000"',
      );
      expect(script.body.body).not.toContain('__ANNOTATION_INDEXER_URL__');
    }
    expect(chapterQuery.body.body).toContain('callerDid = caller_did');
    expect(chapterQuery.body.body).not.toContain('db.query');
    expect(
      calls.find(
        (call) =>
          call.path === '/api/admin/lexicons' &&
          call.body.lexicon_json.id ===
            'com.marginsbible.annotation.listForChapter',
      ).body.target_collection,
    ).toBe('com.marginsbible.annotation');
    const client = calls.find(
      (call) =>
        call.path === '/api/admin/api-clients' && call.method === 'POST',
    ).body;
    expect(client).toMatchObject({
      client_uri: 'http://127.0.0.1:7654',
      redirect_uris: ['http://127.0.0.1:7654/oauth/callback'],
      allowed_origins: ['http://127.0.0.1:7654'],
      client_type: 'public',
    });
    const clientId = new URL(client.client_id_url);
    expect(clientId.origin).toBe('http://localhost');
    expect(clientId.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:7654/oauth/callback',
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('updates the configured public client instead of creating another', async () => {
  const calls = [];
  const client = {
    id: 'existing-client',
    name: 'Margins Bible',
    client_key: 'hvc_existing',
    scopes: 'outdated',
  };
  const server = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    calls.push({ path: request.url, method: request.method, body });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/admin/settings/xrpc-proxy') {
      response.end(
        JSON.stringify({ mode: 'open', nsids: [], routing: 'serviceproxy' }),
      );
    } else if (request.url === '/api/admin/api-clients') {
      response.end(JSON.stringify([client]));
    } else if (request.url === '/api/admin/api-clients/existing-client') {
      if (request.method === 'PUT') client.scopes = body.scopes;
      response.end(JSON.stringify(client));
    } else {
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { code, output } = await runProvisioning(server.address().port, {
      VITE_HAPPYVIEW_CLIENT_KEY: 'hvc_existing',
    });
    expect(code, output).toBe(0);
    expect(
      calls.some(
        (call) =>
          call.path === '/api/admin/api-clients' && call.method === 'POST',
      ),
    ).toBe(false);
    const update = calls.find(
      (call) =>
        call.path === '/api/admin/api-clients/existing-client' &&
        call.method === 'PUT',
    );
    expect(update.body.scopes).toContain(
      'com.marginsbible.annotation.listForChapter',
    );
    expect(update.body.scopes).toContain('action=delete');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
