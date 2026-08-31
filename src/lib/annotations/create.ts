import { getCurrentAccountFn } from '#/lib/auth/functions';
import {
  claimAnonymousAnnotations,
  createAnonymousAnnotation,
} from './indexeddb';
import type { CreateAnnotationInput, LocalAnnotation } from './types';

export async function createAnnotation(
  input: CreateAnnotationInput,
): Promise<LocalAnnotation> {
  const annotation = await createAnonymousAnnotation(input);

  try {
    const account = await getCurrentAccountFn();
    if (!account) return annotation;

    const claimed = await claimAnonymousAnnotations(account.did);
    return (
      claimed.find((candidate) => candidate.id === annotation.id) ?? annotation
    );
  } catch {
    return annotation;
  }
}
