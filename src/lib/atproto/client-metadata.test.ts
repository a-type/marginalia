import { describe, expect, it } from 'vitest';

import { getOAuthClientMetadata } from './client-metadata';

const expectedScope = [
  'atproto',
  'repo?collection=com.apsotilbible.annotation&collection=com.apsotilbible.highlight&collection=com.apsotilbible.profile&collection=com.apsotilbible.follow&action=create&action=update',
  'rpc?lxm=com.apsotilbible.annotation.listForChapter&lxm=com.apsotilbible.highlight.listForChapter&lxm=com.apsotilbible.profile.list&lxm=com.apsotilbible.profile.getForDids&lxm=com.apsotilbible.follow.list&lxm=app.bsky.actor.getProfile&aud=*',
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
    const metadata = getOAuthClientMetadata('https://apostil.example.com');

    expect(metadata.client_id).toBe(
      'https://apostil.example.com/oauth-client-metadata.json',
    );
    expect(metadata.redirect_uris).toEqual([
      'https://apostil.example.com/oauth/callback',
    ]);
  });
});
