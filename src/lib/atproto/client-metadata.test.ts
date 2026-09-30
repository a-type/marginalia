import { describe, expect, it } from 'vitest';

import { getOAuthClientMetadata } from './client-metadata';

describe('OAuth client metadata', () => {
  it('uses the ATProto localhost client ID format for local development', () => {
    const metadata = getOAuthClientMetadata('http://127.0.0.1:7654');
    const clientId = new URL(metadata.client_id);

    expect(clientId.origin).toBe('http://localhost');
    expect(clientId.pathname).toBe('/');
    expect(clientId.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:7654/oauth/callback',
    );
    expect(clientId.searchParams.get('scope')).toBe(
      'atproto transition:generic',
    );
    expect(metadata.scope).toBe('atproto transition:generic');
    expect(metadata.redirect_uris).toEqual([
      'http://127.0.0.1:7654/oauth/callback',
    ]);
  });

  it('uses the published metadata URL as a production client ID', () => {
    const metadata = getOAuthClientMetadata('https://marginalia.example.com');

    expect(metadata.client_id).toBe(
      'https://marginalia.example.com/oauth-client-metadata.json',
    );
    expect(metadata.redirect_uris).toEqual([
      'https://marginalia.example.com/oauth/callback',
    ]);
  });
});
