import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { completeHappyViewOAuthCallback } from '#/lib/atproto/client';
import { m } from '#/paraglide/messages';
import cls from './callback.module.css';

export const Route = createFileRoute('/oauth/callback')({
  component: OAuthCallback,
});

function OAuthCallback() {
  const navigate = Route.useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void completeHappyViewOAuthCallback()
      .then(() => {
        if (active) {
          void navigate({ to: '/', replace: true, reloadDocument: true });
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className={cls.root}>
      {error ? (
        <section className={cls.content} role="alert">
          <h1>{m.oauth_callback_failed_title()}</h1>
          <p>{m.oauth_callback_failed_description()}</p>
          <a className={cls.returnLink} href="/">
            {m.oauth_callback_return()}
          </a>
        </section>
      ) : (
        <p role="status">Completing sign in…</p>
      )}
    </main>
  );
}
