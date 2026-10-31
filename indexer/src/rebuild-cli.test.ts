import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('runs the rebuild command against HappyView and the indexer', async () => {
  const calls: Array<{
    method: string | undefined;
    url: string;
    body: string;
  }> = [];
  const rebuildId = '00000000-0000-4000-8000-000000000001';
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const url = request.url ?? '';
    calls.push({ method: request.method, url, body });
    response.setHeader('content-type', 'application/json');
    if (url === '/rebuild/start') {
      response.end(JSON.stringify({ id: rebuildId }));
    } else if (url.startsWith('/api/admin/records?')) {
      response.end(JSON.stringify({ records: [] }));
    } else if (url === '/rebuild/records' || url === '/rebuild/finish') {
      response.end('{}');
    } else {
      response.writeHead(404);
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not bind to a TCP port');
  }

  try {
    const origin = `http://127.0.0.1:${address.port}`;
    const child = spawn('pnpm', ['run', 'rebuild-indexes'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOTENV_PATH: fileURLToPath(
          new URL('../../.env.example', import.meta.url),
        ),
        DOTENV_QUIET: 'true',
        HAPPYVIEW_BASE_URL: `${origin}/api`,
        HAPPYVIEW_ADMIN_KEY: 'test-admin-key',
        ANNOTATION_INDEXER_URL: origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    const [code] = await once(child, 'close');
    expect(code, output).toBe(0);
    expect(output).toContain('Rebuilt annotation index from 0 records.');
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/rebuild/start' });
    expect(
      calls
        .filter((call) => call.url.startsWith('/api/admin/records?'))
        .map((call) => new URL(call.url, origin).searchParams.get('collection'))
        .sort(),
    ).toEqual(['com.marginsbible.annotation', 'com.marginsbible.follow']);
    expect(
      calls
        .filter((call) => call.url === '/rebuild/records')
        .map((call) => JSON.parse(call.body)),
    ).toEqual([
      { id: rebuildId, events: [] },
      { id: rebuildId, events: [] },
    ]);
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      url: '/rebuild/finish',
      body: JSON.stringify({ id: rebuildId }),
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 20_000);
