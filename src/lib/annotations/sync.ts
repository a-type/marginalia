import { listOwnAnnotationsFn, uploadAnnotationFn } from './functions';
import type { AnnotationRemote } from './sync-core';
import { synchronizeAnnotations } from './sync-core';

const serverRemote: AnnotationRemote = {
  upload: (annotation) =>
    uploadAnnotationFn({
      data: {
        rkey: annotation.id,
        verses: annotation.verses,
        ...(annotation.comment ? { comment: annotation.comment } : {}),
        ...(annotation.color ? { color: annotation.color } : {}),
        createdAt: annotation.createdAt,
      },
    }),
  list: () => listOwnAnnotationsFn(),
};

let activeSync: Promise<void> | null = null;

export function requestAnnotationSync(ownerDid: string): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = synchronizeAnnotations(ownerDid, serverRemote).finally(() => {
    activeSync = null;
  });
  return activeSync;
}
