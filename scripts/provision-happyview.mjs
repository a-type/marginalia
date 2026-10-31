import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lexiconsDirectory = join(projectRoot, 'packages/atproto/lexicons');
const scriptsDirectory = join(projectRoot, 'happyview', 'lua');
const baseUrl = process.env.HAPPYVIEW_BASE_URL?.replace(/\/+$/, '');
const adminKey = process.env.HAPPYVIEW_ADMIN_KEY;
const indexerUrl = new URL(
  process.env.ANNOTATION_INDEXER_URL ?? 'http://annotation-indexer:3000',
);
if (
  !['http:', 'https:'].includes(indexerUrl.protocol) ||
  indexerUrl.username ||
  indexerUrl.password ||
  indexerUrl.search ||
  indexerUrl.hash ||
  indexerUrl.pathname !== '/'
) {
  throw new Error('ANNOTATION_INDEXER_URL must be an HTTP origin');
}
const clientScopes = [
  'atproto',
  'repo?collection=com.marginsbible.annotation&collection=com.marginsbible.highlight&collection=com.marginsbible.profile&collection=com.marginsbible.follow&action=create&action=update&action=delete',
  'rpc?lxm=com.marginsbible.annotation.listForChapter&lxm=com.marginsbible.annotation.listMine&lxm=com.marginsbible.highlight.listForChapter&lxm=com.marginsbible.profile.list&lxm=com.marginsbible.profile.getForDids&lxm=com.marginsbible.follow.list&lxm=app.bsky.actor.getProfile&aud=*',
].join(' ');

if (!baseUrl) {
  throw new Error(
    'HAPPYVIEW_BASE_URL must point to the HappyView /api base path',
  );
}
if (!adminKey) {
  throw new Error(
    'HAPPYVIEW_ADMIN_KEY must be set to a HappyView admin API key',
  );
}

async function requestJsonApi(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${adminKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `HappyView ${path} failed (${response.status}): ${responseBody}`,
    );
  }
  return responseBody;
}

async function getJson(path) {
  const responseBody = await requestJsonApi(path);
  try {
    return JSON.parse(responseBody);
  } catch (error) {
    throw new Error(`HappyView ${path} returned invalid JSON`, {
      cause: error,
    });
  }
}

function matchesNsidPattern(pattern, nsid) {
  const prefix = pattern.endsWith('.*') ? pattern.slice(0, -2) : null;
  return prefix === null ? pattern === nsid : nsid.startsWith(`${prefix}.`);
}

async function configureXrpcProxy() {
  const path = '/admin/settings/xrpc-proxy';
  const config = await getJson(path);
  if (
    !config ||
    !['disabled', 'open', 'allowlist', 'blocklist'].includes(config.mode) ||
    !Array.isArray(config.nsids) ||
    !config.nsids.every((nsid) => typeof nsid === 'string') ||
    !['authority', 'serviceproxy'].includes(config.routing)
  ) {
    throw new Error(
      'HappyView XRPC proxy routing requires HappyView v2.14 or newer',
    );
  }

  const nsids = [...config.nsids];
  const putRecordNsid = 'com.atproto.repo.putRecord';
  if (
    config.mode === 'allowlist' &&
    !nsids.some((pattern) => matchesNsidPattern(pattern, putRecordNsid))
  ) {
    nsids.push(putRecordNsid);
  }
  if (
    config.mode === 'disabled' ||
    (config.mode === 'blocklist' &&
      nsids.some((pattern) => matchesNsidPattern(pattern, putRecordNsid)))
  ) {
    throw new Error(
      `HappyView's XRPC proxy policy blocks ${putRecordNsid}, which Margins needs to write records`,
    );
  }

  await requestJsonApi(path, 'PUT', {
    mode: config.mode,
    nsids,
    routing: 'serviceproxy',
  });
  const updatedConfig = await getJson(path);
  if (updatedConfig.routing !== 'serviceproxy') {
    throw new Error('HappyView did not enable service proxy routing');
  }
}

async function waitForHappyView() {
  const healthUrl = new URL('/health', baseUrl);
  let lastError;

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }

  throw new Error('HappyView did not become healthy within 60 seconds', {
    cause: lastError,
  });
}

async function post(path, body) {
  return requestJsonApi(path, 'POST', body);
}

function getAppClientMetadata() {
  const configuredUrl = process.env.APP_URL;
  if (!configuredUrl) {
    throw new Error('APP_URL must be set to the app public origin');
  }

  let url;
  try {
    url = new URL(configuredUrl);
  } catch (error) {
    throw new Error('APP_URL must be a valid public origin', { cause: error });
  }

  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal))
  ) {
    throw new Error('APP_URL must be an HTTPS origin (or a local HTTP origin)');
  }

  const origin = url.origin;
  const redirectUri = new URL('/oauth/callback', origin).href;
  const clientIdUrl = isLocal
    ? getLoopbackClientId(redirectUri)
    : new URL('/oauth-client-metadata.json', origin).href;

  return { origin, redirectUri, clientIdUrl };
}

function getLoopbackClientId(redirectUri) {
  const clientId = new URL('http://localhost/');
  clientId.searchParams.set('redirect_uri', redirectUri);
  clientId.searchParams.set('scope', clientScopes);
  return clientId.href;
}

async function configureApiClient() {
  const clientKey = process.env.VITE_HAPPYVIEW_CLIENT_KEY?.trim();
  if (clientKey) {
    const clients = await getJson('/admin/api-clients');
    if (!Array.isArray(clients)) {
      throw new Error('HappyView returned an invalid API client list');
    }

    const client = clients.find(
      (candidate) => candidate?.client_key === clientKey,
    );
    if (!client) {
      throw new Error(
        'VITE_HAPPYVIEW_CLIENT_KEY is set, but no HappyView API client matches it. Check the key or unset it to provision a new client.',
      );
    }
    if (typeof client.id !== 'string') {
      throw new Error('The matching HappyView API client has no valid ID');
    }

    if (client.scopes !== clientScopes) {
      const clientPath = `/admin/api-clients/${encodeURIComponent(client.id)}`;
      await requestJsonApi(clientPath, 'PUT', { scopes: clientScopes });
      const updatedClient = await getJson(clientPath);
      if (updatedClient.scopes !== clientScopes) {
        throw new Error(
          'HappyView did not apply the requested API client scopes',
        );
      }
      console.info(`Updated scopes for HappyView API client ${client.name}.`);
    } else {
      console.info(
        `HappyView API client ${client.name} scopes are up to date.`,
      );
    }
    return;
  }

  const { origin, redirectUri, clientIdUrl } = getAppClientMetadata();
  const responseBody = await post('/admin/api-clients', {
    name: 'Margins Bible',
    client_id_url: clientIdUrl,
    client_uri: origin,
    redirect_uris: [redirectUri],
    client_type: 'public',
    allowed_origins: [origin],
    scopes: clientScopes,
  });

  let createdClient;
  try {
    createdClient = JSON.parse(responseBody);
  } catch (error) {
    throw new Error(
      'HappyView returned invalid JSON when creating the API client',
      {
        cause: error,
      },
    );
  }
  if (typeof createdClient.client_key !== 'string') {
    throw new Error(
      'HappyView created an API client without returning its client key',
    );
  }

  console.info('Created the Margins Bible HappyView API client.');
  console.info(
    `Set this public key in the app environment: VITE_HAPPYVIEW_CLIENT_KEY=${createdClient.client_key}`,
  );
}

await waitForHappyView();
await configureXrpcProxy();

const lexiconFiles = (await readdir(lexiconsDirectory))
  .filter((name) => name.endsWith('.json'))
  .sort();
const lexicons = await Promise.all(
  lexiconFiles.map(async (file) => ({
    lexicon: JSON.parse(await readFile(join(lexiconsDirectory, file), 'utf8')),
  })),
);
const recordOrder = new Map([
  ['com.marginsbible.commentary', 0],
  ['com.marginsbible.annotation', 1],
  ['com.marginsbible.profile', 2],
  ['com.marginsbible.follow', 3],
  ['com.marginsbible.highlight', 4],
]);
const recordLexicons = lexicons
  .filter(({ lexicon }) => lexicon.defs?.main?.type === 'record')
  .sort(
    (left, right) =>
      (recordOrder.get(left.lexicon.id) ?? Number.MAX_SAFE_INTEGER) -
      (recordOrder.get(right.lexicon.id) ?? Number.MAX_SAFE_INTEGER),
  );
const queryLexicons = lexicons
  .filter(({ lexicon }) => lexicon.defs?.main?.type !== 'record')
  .sort((left, right) => left.lexicon.id.localeCompare(right.lexicon.id));
const queryTargets = new Map([
  ['com.marginsbible.annotation.listForChapter', 'com.marginsbible.annotation'],
  ['com.marginsbible.annotation.listMine', 'com.marginsbible.annotation'],
  ['com.marginsbible.follow.list', 'com.marginsbible.follow'],
  ['com.marginsbible.highlight.listForChapter', 'com.marginsbible.highlight'],
  ['com.marginsbible.profile.getForDids', 'com.marginsbible.profile'],
  ['com.marginsbible.profile.list', 'com.marginsbible.profile'],
]);

// Install hooks before enabling collection backfill.
for (const collection of [
  'com.marginsbible.annotation',
  'com.marginsbible.follow',
]) {
  await post('/admin/scripts', {
    id: `record.index:${collection}`,
    script_type: 'lua',
    body: (
      await readFile(join(scriptsDirectory, 'index-record.lua'), 'utf8')
    ).replaceAll(
      '__ANNOTATION_INDEXER_URL__',
      JSON.stringify(indexerUrl.origin),
    ),
    description: 'Maintains the private Margins annotation index.',
  });
}

for (const { lexicon } of [...recordLexicons, ...queryLexicons]) {
  const isRecord = lexicon.defs?.main?.type === 'record';
  await post('/admin/lexicons', {
    lexicon_json: lexicon,
    ...(isRecord ? { backfill: true } : {}),
    ...(queryTargets.has(lexicon.id)
      ? { target_collection: queryTargets.get(lexicon.id) }
      : {}),
  });
}

const scripts = [
  {
    id: 'xrpc.query:com.marginsbible.annotation.listForChapter',
    file: 'list-annotations-for-chapter.lua',
    description: 'Lists chapter annotations from the caller and followed DIDs.',
  },
  {
    id: 'xrpc.query:com.marginsbible.annotation.listMine',
    file: 'list-my-annotations.lua',
    description: 'Lists the authenticated caller annotations newest first.',
  },
  {
    id: 'xrpc.query:com.marginsbible.follow.list',
    file: 'list-follows.lua',
    description: 'Lists follow records created by the authenticated caller.',
  },
  {
    id: 'xrpc.query:com.marginsbible.highlight.listForChapter',
    file: 'list-highlights-for-chapter.lua',
    description: 'Lists chapter highlights for the authenticated caller.',
  },
  {
    id: 'xrpc.query:com.marginsbible.profile.getForDids',
    file: 'list-profiles-for-dids.lua',
    description: 'Returns indexed Margins profiles for multiple DIDs.',
  },
];

for (const script of scripts) {
  await post('/admin/scripts', {
    id: script.id,
    script_type: 'lua',
    body: (
      await readFile(join(scriptsDirectory, script.file), 'utf8')
    ).replaceAll(
      '__ANNOTATION_INDEXER_URL__',
      JSON.stringify(indexerUrl.origin),
    ),
    description: script.description,
  });
}

await configureApiClient();

console.info(
  `Provisioned ${lexicons.length} lexicons, ${scripts.length} query scripts, and annotation/follow record hooks in HappyView.`,
);
