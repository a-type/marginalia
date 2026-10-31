import { useDbClient } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { requestAnnotationSync } from '../../lib/annotations/sync';
import { logger } from '../../logger';
import { currentUserDidQueryOptions } from '../../queries/user';

export function AnnotationSyncCoordinator() {
  const dbClient = useDbClient();
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  const lastSyncAuthCheck = useRef(0);

  useEffect(() => {
    const authCheck = userDidQuery.dataUpdatedAt;
    if (!userDidQuery.isSuccess || !accountDid || authCheck === 0) return;
    if (lastSyncAuthCheck.current === authCheck) return;

    lastSyncAuthCheck.current = authCheck;
    void requestAnnotationSync(dbClient, accountDid).catch((error: unknown) => {
      logger.warn('Annotation sync failed', error);
    });
  }, [
    accountDid,
    dbClient,
    userDidQuery.dataUpdatedAt,
    userDidQuery.isSuccess,
  ]);

  return null;
}
