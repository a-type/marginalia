import {
  claimAnonymousAnnotations,
  listPendingAnnotations,
  markAnnotationSynced,
  markAnnotationSyncError,
  reconcileRemoteAnnotations,
} from './indexeddb';
import type { LocalAnnotation, RemoteAnnotation } from './types';

export interface AnnotationRemote {
  upload: (annotation: LocalAnnotation) => Promise<{
    uri: string;
    cid: string | null;
  }>;
  list: () => Promise<RemoteAnnotation[]>;
}

export async function synchronizeAnnotations(
  ownerDid: string,
  remote: AnnotationRemote,
): Promise<void> {
  if (!navigator.onLine) return;

  await claimAnonymousAnnotations(ownerDid);
  const pending = await listPendingAnnotations(ownerDid);
  for (const annotation of pending) {
    try {
      console.log('Uploading annotation', annotation.id);
      const result = await remote.upload(annotation);
      await markAnnotationSynced(annotation.id, result);
    } catch (error) {
      await markAnnotationSyncError(annotation.id, error);
    }
  }

  const remoteAnnotations = await remote.list();
  await reconcileRemoteAnnotations(ownerDid, remoteAnnotations);
}
