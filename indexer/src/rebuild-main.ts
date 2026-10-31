import { z } from 'zod';
import { rebuildIndex } from './rebuild.ts';

const env = z
  .object({
    HAPPYVIEW_BASE_URL: z.url(),
    HAPPYVIEW_ADMIN_KEY: z.string().min(1),
    ANNOTATION_INDEXER_URL: z.url(),
  })
  .parse(process.env);

await rebuildIndex({
  happyviewUrl: env.HAPPYVIEW_BASE_URL,
  adminKey: env.HAPPYVIEW_ADMIN_KEY,
  indexerUrl: env.ANNOTATION_INDEXER_URL,
});
