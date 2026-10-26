import { describe, expect, it } from 'vitest';

import { getOAuthClientMetadata } from './client-metadata';

const expectedScope = [
  'atproto',
  'repo?collection=com.marginsbible.annotation&collection=com.marginsbible.highlight&collection=com.marginsbible.profile&collection=com.marginsbible.follow&action=create&action=update&action=delete',
  'rpc?lxm=com.marginsbible.annotation.listForChapter&lxm=com.marginsbible.annotation.listMine&lxm=com.marginsbible.highlight.listForChapter&lxm=com.marginsbible.profile.list&lxm=com.marginsbible.profile.getForDids&lxm=com.marginsbible.follow.list&lxm=app.bsky.actor.getProfile&aud=*',
].join(' ');

describe('OAuth client metadata', () => {
  it('uses the ATProto localhost client ID format for local development', () => {
    const metadata = getOAuthClientMetadata('http://127.0.0.1:7654');
    const clientId = new URL(metadata.client_id);

    expect(clientId.origin).toBe('http://localhost');
    expect(clientId.pathname).toBe('/');
    expect(clientId.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:7654/oauth/callback',
    );
    expect(clientId.searchParams.get('scope')).toBe(expectedScope);
    expect(metadata.scope).toBe(expectedScope);
    expect(metadata.redirect_uris).toEqual([
      'http://127.0.0.1:7654/oauth/callback',
    ]);
  });

  it('uses the published metadata URL as a production client ID', () => {
    const metadata = getOAuthClientMetadata('https://margins.example.com');

    expect(metadata.client_id).toBe(
      'https://margins.example.com/oauth-client-metadata.json',
    );
    expect(metadata.redirect_uris).toEqual([
      'https://margins.example.com/oauth/callback',
    ]);
  });
});
