import { useDbClient } from '@tanstack/react-db';
import { useEffect } from 'react';

import { requestHighlightSync } from '#/lib/highlights/sync';

export function useHighlightSync(accountDid: string | null) {
  const dbClient = useDbClient();
  useEffect(() => {
    if (!accountDid) return;
    const synchronize = () => void requestHighlightSync(dbClient, accountDid);
    synchronize();
    window.addEventListener('online', synchronize);
    return () => window.removeEventListener('online', synchronize);
  }, [accountDid, dbClient]);
}
