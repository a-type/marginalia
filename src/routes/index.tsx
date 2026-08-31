import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import { readStoredBibleLocation } from '#/lib/bible/location';
import { readStoredTranslationId } from '#/lib/bible/source';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  const navigate = Route.useNavigate();

  useEffect(() => {
    const location = readStoredBibleLocation();
    const translation = readStoredTranslationId();
    void navigate({
      to: '/$translation/$book/$chapter',
      params: {
        translation,
        book: location.bookId,
        chapter: String(location.chapter),
      },
      replace: true,
    });
  }, [navigate]);

  return null;
}
