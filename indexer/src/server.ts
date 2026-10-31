import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  IndexNotReadyError,
  IndexStore,
  RebuildConflictError,
} from './store.ts';

const rebuildBatchSchema = z.object({
  id: z.string().uuid(),
  events: z.array(z.unknown()).max(100),
});
const rebuildFinishSchema = z.object({ id: z.string().uuid() });

export function createIndexerServer(store: IndexStore) {
  return createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === 'GET' && request.url === '/health') {
        send(200, { ready: store.ready });
        return;
      }
      if (request.method !== 'POST') {
        send(404, { error: 'Not found' });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 16 * 1024 * 1024) {
          send(413, { error: 'Request body exceeds 16 MiB' });
          return;
        }
        chunks.push(buffer);
      }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      switch (request.url) {
        case '/events':
          store.ingest(input);
          send(200, { ok: true });
          break;
        case '/annotations/chapter':
          send(200, store.listChapter(input));
          break;
        case '/rebuild/start':
          send(200, { id: store.startRebuild() });
          break;
        case '/rebuild/records': {
          const batch = rebuildBatchSchema.parse(input);
          store.stageRebuild(batch.id, batch.events);
          send(200, { ok: true });
          break;
        }
        case '/rebuild/finish':
          store.finishRebuild(rebuildFinishSchema.parse(input).id);
          send(200, { ok: true });
          break;
        default:
          send(404, { error: 'Not found' });
      }
    } catch (error) {
      console.error('Annotation indexer request failed', request.url, error);
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        send(400, { error: 'Invalid request', detail: error.message });
      } else if (error instanceof IndexNotReadyError) {
        send(503, { error: error.message });
      } else if (error instanceof RebuildConflictError) {
        send(409, { error: error.message });
      } else {
        send(500, { error: 'Annotation indexer request failed' });
      }
    }
  });
}

export function startIndexer() {
  const path = process.env.INDEXER_DATABASE_PATH ?? '/data/annotations.sqlite';
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.PORT ?? 3000);
  mkdirSync(dirname(path), { recursive: true });
  const store = new IndexStore(path);
  const server = createIndexerServer(store);
  server.listen(port, process.env.HOST ?? '::', () => {
    console.info(`Annotation indexer listening on ${port}`);
  });
  const close = () => {
    server.close(() => {
      store.close();
    });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return server;
}
