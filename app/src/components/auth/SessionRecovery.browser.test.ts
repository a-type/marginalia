import { DbClient, DbProvider } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { getAnnotationCollections } from '../../lib/annotations/collections';
import { createAnnotation } from '../../lib/annotations/create';
import {
  getHappyViewSession,
  happyViewAuthState,
  type HappyViewSession,
} from '../../lib/atproto/client';
import { getHighlightCollections } from '../../lib/highlights/collections';
import { createHighlight } from '../../lib/highlights/create';
import { toggleHighlight } from '../../lib/highlights/toggle';
import { AnnotationSyncCoordinator } from '../annotations/AnnotationSyncCoordinator';
import { SessionRecovery } from './SessionRecovery';

const {
  init,
  signIn,
  uploadAnnotation,
  listMyAnnotationsPage,
  uploadHighlight,
  deleteHighlight,
} = vi.hoisted(() => ({
  init: vi.fn(),
  signIn: vi.fn(),
  uploadAnnotation: vi.fn(),
  listMyAnnotationsPage: vi.fn(),
  uploadHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
}));

vi.mock('@happyview/oauth-client-browser', () => ({
  HappyViewBrowserClient: class {
    init = init;
    signIn = signIn;
  },
}));

vi.mock('../../lib/annotations/functions', () => ({
  uploadAnnotation,
  listMyAnnotationsPage,
}));

vi.mock('../../lib/highlights/functions', () => ({
  uploadHighlight,
  deleteHighlight,
}));

async function writeRecord(path: string, uri: string) {
  const session = await getHappyViewSession();
  if (!session) throw new Error('Expected a signed-in account');
  await session.fetchHandler(path, { method: 'POST' });
  return { uri, cid: 'uploaded-cid' };
}

it('recovers queued writes in place without losing unfinished edits', async () => {
  const did = 'did:plc:abcdefghijklmnopqrstuvwx';
  const dbClient = new DbClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubEnv('VITE_HAPPYVIEW_CLIENT_KEY', 'public-test-client-key');
  localStorage.removeItem('margins.highlights.v1');
  const expiredFetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json(
          { error: 'session expired, please re-authenticate' },
          { status: 401 },
        ),
      ),
    );
  init.mockResolvedValue({ session: { did, fetchHandler: expiredFetch } });
  listMyAnnotationsPage.mockResolvedValue({ annotations: [] });
  uploadAnnotation.mockImplementation(({ data }) =>
    writeRecord(
      '/xrpc/com.atproto.repo.putRecord',
      `at://${did}/com.marginsbible.annotation/${data.rkey}`,
    ),
  );
  uploadHighlight.mockImplementation(({ data }) =>
    writeRecord(
      '/xrpc/com.atproto.repo.putRecord',
      `at://${did}/com.marginsbible.highlight/${data.verseId}`,
    ),
  );
  deleteHighlight.mockImplementation(({ data }) =>
    writeRecord('/xrpc/com.atproto.repo.deleteRecord', data.uri),
  );

  try {
    const annotation = await createAnnotation(dbClient, {
      verses: ['GEN/1:1'],
      comment: 'Saved before session recovery',
      translation: 'eng_webu',
    });
    const highlight = await createHighlight(dbClient, {
      verseId: 'GEN/1:2',
      color: 'lemon',
    });
    const removed = await createHighlight(dbClient, {
      verseId: 'GEN/1:3',
      color: 'lemon',
    });
    const { highlights } = getHighlightCollections(dbClient);
    await highlights.update(removed.id, (draft) => {
      draft.uri = removed.id;
      draft.status = 'synced';
    }).isPersisted.promise;
    await toggleHighlight(dbClient, removed.verseId);

    flushSync(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            DbProvider,
            { client: dbClient },
            createElement(AnnotationSyncCoordinator),
            createElement('textarea', {
              'aria-label': 'Unfinished annotation',
              defaultValue: 'Keep this unfinished edit',
            }),
            createElement(SessionRecovery),
          ),
        ),
      ),
    );

    await expect.element(page.getByRole('dialog')).toBeVisible();
    const { annotations } = getAnnotationCollections(dbClient);
    expect(annotations.get(annotation.id)).toMatchObject({
      comment: annotation.comment,
      authorDid: did,
      status: 'pending',
    });
    expect(highlights.get(highlight.id)?.status).toBe('pending');
    expect(highlights.get(removed.id)?.status).toBe('deleting');

    await userEvent.click(page.getByRole('button', { name: 'Not now' }));
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(happyViewAuthState.expiredDid).toBe(did);
    await expect
      .element(page.getByRole('textbox', { name: 'Unfinished annotation' }))
      .toHaveValue('Keep this unfinished edit');

    happyViewAuthState.promptOpen = true;
    signIn.mockRejectedValueOnce(new Error('Popup login failed'));
    await userEvent.click(
      page.getByRole('button', { name: 'Sign in again', exact: true }),
    );
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent("We couldn't sign you in again");
    expect(annotations.get(annotation.id)?.status).toBe('pending');
    expect(happyViewAuthState.expiredDid).toBe(did);

    const freshFetch = vi.fn().mockResolvedValue(Response.json({}));
    let finishSignIn!: (
      session: Pick<HappyViewSession, 'did' | 'fetchHandler'>,
    ) => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSignIn = resolve;
        }),
    );
    await userEvent.click(
      page.getByRole('button', { name: 'Sign in again', exact: true }),
    );
    await expect
      .element(page.getByRole('button', { name: 'Signing in...' }))
      .toBeDisabled();
    expect(signIn).toHaveBeenLastCalledWith(did, { display: 'popup' });
    finishSignIn({ did, fetchHandler: freshFetch });

    await expect
      .poll(() => annotations.get(annotation.id)?.status)
      .toBe('uploaded');
    await expect
      .poll(() => highlights.get(highlight.id)?.status)
      .toBe('uploaded');
    await expect.poll(() => highlights.get(removed.id)?.status).toBe('deleted');
    expect(annotations.get(annotation.id)).toMatchObject({
      comment: annotation.comment,
      authorDid: did,
      syncError: null,
    });
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await expect
      .element(page.getByRole('textbox', { name: 'Unfinished annotation' }))
      .toHaveValue('Keep this unfinished edit');
    expect(happyViewAuthState.expiredDid).toBeNull();
    expect(freshFetch).toHaveBeenCalled();
  } finally {
    root.unmount();
    container.remove();
    queryClient.clear();
    await dbClient.cleanup();
    localStorage.removeItem('margins.highlights.v1');
    happyViewAuthState.expiredDid = null;
    happyViewAuthState.promptOpen = false;
    vi.unstubAllEnvs();
  }
});
