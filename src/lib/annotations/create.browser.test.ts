import { DbClient } from '@tanstack/react-db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensureAnnotationCollectionReady,
  getAnnotationCollections,
} from './collections';
import { createAnnotation } from './create';

vi.mock('#/lib/auth/functions', () => ({
  getCurrentUserDid: vi.fn().mockResolvedValue(null),
}));

const clients: DbClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.cleanup()));
});

describe('creating annotations for ranges', () => {
  it('persists every selected verse across chapters in scripture order', async () => {
    const client = new DbClient();
    clients.push(client);
    const verses = ['JHN/3:35', 'JHN/3:36', 'JHN/4:1', 'JHN/4:2'] as const;
    const annotation = await createAnnotation(client, {
      verses,
      comment: 'A cross-chapter note',
    });
    expect(annotation).toMatchObject({
      bookId: 'JHN',
      chapter: 3,
      chapterKeys: ['JHN/3', 'JHN/4'],
      verses,
      comment: 'A cross-chapter note',
    });

    const restored = new DbClient();
    clients.push(restored);
    const collections = getAnnotationCollections(restored);
    await ensureAnnotationCollectionReady(collections.annotations);
    await collections.annotations.utils.loadAll();
    expect(collections.annotations.get(annotation.id)?.verses).toEqual(verses);
  });
});
