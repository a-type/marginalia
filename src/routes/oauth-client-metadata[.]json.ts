import { createFileRoute } from '@tanstack/react-router';

import { oauth } from '#/lib/atproto.server';

export const Route = createFileRoute('/oauth-client-metadata.json')({
  server: {
    handlers: {
      GET: () =>
        Response.json(oauth.clientMetadata, {
          headers: { 'cache-control': 'public, max-age=300' },
        }),
    },
  },
});
