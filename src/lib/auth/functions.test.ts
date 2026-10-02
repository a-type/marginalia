import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getHappyViewSession, signInToHappyView, signOutOfHappyView } =
  vi.hoisted(() => ({
    getHappyViewSession: vi.fn(),
    signInToHappyView: vi.fn(),
    signOutOfHappyView: vi.fn(),
  }));

vi.mock('#/lib/atproto/client', () => ({
  getHappyViewSession,
  signInToHappyView,
  signOutOfHappyView,
}));

describe('current HappyView user identity', () => {
  beforeEach(() => {
    getHappyViewSession.mockReset();
    signInToHappyView.mockReset();
    signOutOfHappyView.mockReset();
  });

  it('returns the DID from the authenticated session without an XRPC lookup', async () => {
    const did = 'did:plc:abcdefghijklmnopqrstuvwx';
    const fetchHandler = vi.fn();
    getHappyViewSession.mockResolvedValue({ did, fetchHandler });

    const { getCurrentUserDid } = await import('./functions');

    await expect(getCurrentUserDid()).resolves.toBe(did);
    expect(fetchHandler).not.toHaveBeenCalled();
  });
});
