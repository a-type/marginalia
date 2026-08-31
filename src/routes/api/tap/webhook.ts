import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '#/lib/error';
import { authorizeTapWebhook, ingestTapWebhookPayload } from '#/lib/tap/server';

export const Route = createFileRoute('/api/tap/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          authorizeTapWebhook(request);
          return Response.json(
            await ingestTapWebhookPayload(await request.json()),
          );
        } catch (error) {
          if (AppError.isInstance(error)) {
            return error.toResponse();
          }
          return new AppError(
            AppError.Code.BadRequest,
            'Unable to ingest Tap webhook event',
            error,
          ).toResponse();
        }
      },
    },
  },
});
