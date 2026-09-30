import { createFileRoute } from '@tanstack/react-router';

import { getOAuthClientMetadata } from '#/lib/atproto/client-metadata';
import { AppError } from '#/lib/error';

export const Route = createFileRoute('/oauth-client-metadata.json')({
  server: {
    handlers: {
      GET: () => {
        const appUrl = process.env.APP_URL;
        if (!appUrl) {
          throw new AppError(
            AppError.Code.InternalServerError,
            'APP_URL environment variable is not set',
          );
        }
        return Response.json(getOAuthClientMetadata(appUrl), {
          headers: { 'cache-control': 'public, max-age=300' },
        });
      },
    },
  },
});
