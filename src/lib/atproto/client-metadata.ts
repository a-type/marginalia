import { AppError } from '#/lib/error';

export const oauthScope = [
  'atproto',
  'repo?collection=com.apostilbible.annotation&collection=com.apostilbible.highlight&collection=com.apostilbible.profile&collection=com.apostilbible.follow&action=create&action=update',
  'rpc?lxm=com.apostilbible.annotation.listForChapter&lxm=com.apostilbible.highlight.listForChapter&lxm=com.apostilbible.profile.list&lxm=com.apostilbible.profile.getForDids&lxm=com.apostilbible.follow.list&lxm=app.bsky.actor.getProfile&aud=*',
].join(' ');

export function getOAuthClientMetadata(appUrl: string) {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch (error) {
    throw new AppError(
      AppError.Code.InternalServerError,
      'APP_URL must be a valid public origin',
      error,
    );
  }

  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      ))
  ) {
    throw new AppError(
      AppError.Code.InternalServerError,
      'APP_URL must be an HTTPS origin (or a local HTTP origin)',
    );
  }

  const origin = url.origin;
  const redirectUrl = new URL('/oauth/callback', origin);
  const redirectUri = redirectUrl.href;
  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  const localClientId = new URL('http://localhost/');
  localClientId.searchParams.set('redirect_uri', redirectUri);
  localClientId.searchParams.set('scope', oauthScope);

  return {
    client_name: 'Apostil',
    client_uri: origin,
    client_id: isLocal
      ? localClientId.href
      : new URL('/oauth-client-metadata.json', origin).href,
    scope: oauthScope,
    redirect_uris: [redirectUri],
    response_types: ['code'],
    application_type: 'web',
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  };
}
