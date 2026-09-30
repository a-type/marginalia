import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { completeHappyViewOAuthCallback } from '#/lib/atproto/client';

export const Route = createFileRoute('/oauth/callback')({
  component: OAuthCallback,
});

function OAuthCallback() {
  const navigate = Route.useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void completeHappyViewOAuthCallback()
      .then(() => {
        if (active) {
          void navigate({ to: '/', replace: true, reloadDocument: true });
        }
      })
      .catch((callbackError: unknown) => {
        if (active) {
          setError(
            callbackError instanceof Error
              ? callbackError.message
              : String(callbackError),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <p role={error ? 'alert' : undefined}>{error ?? 'Completing sign in…'}</p>
  );
}
