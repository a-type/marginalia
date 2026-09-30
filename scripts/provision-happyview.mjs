import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lexiconsDirectory = join(projectRoot, 'lexicons');
const scriptsDirectory = join(projectRoot, 'happyview', 'lua');
const baseUrl = process.env.HAPPYVIEW_BASE_URL?.replace(/\/+$/, '');
const adminKey = process.env.HAPPYVIEW_ADMIN_KEY;

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
      `HappyView's XRPC proxy policy blocks ${putRecordNsid}, which Marginalia needs to write records`,
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
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `HappyView ${path} failed (${response.status}): ${responseBody}`,
    );
  }
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
  ['com.marginalia.commentary', 0],
  ['com.marginalia.annotation', 1],
  ['com.marginalia.profile', 2],
  ['com.marginalia.follow', 3],
  ['com.marginalia.highlight', 4],
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
  ['com.marginalia.annotation.listForChapter', 'com.marginalia.annotation'],
  ['com.marginalia.follow.list', 'com.marginalia.follow'],
  ['com.marginalia.highlight.listForChapter', 'com.marginalia.highlight'],
  ['com.marginalia.profile.getForDids', 'com.marginalia.profile'],
  ['com.marginalia.profile.list', 'com.marginalia.profile'],
]);

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
    id: 'xrpc.query:com.marginalia.annotation.listForChapter',
    file: 'list-annotations-for-chapter.lua',
    description: 'Lists chapter annotations from the caller and followed DIDs.',
  },
  {
    id: 'xrpc.query:com.marginalia.highlight.listForChapter',
    file: 'list-highlights-for-chapter.lua',
    description: 'Lists chapter highlights for the authenticated caller.',
  },
  {
    id: 'xrpc.query:com.marginalia.profile.getForDids',
    file: 'list-profiles-for-dids.lua',
    description: 'Returns indexed Marginalia profiles for multiple DIDs.',
  },
];

for (const script of scripts) {
  await post('/admin/scripts', {
    id: script.id,
    script_type: 'lua',
    body: await readFile(join(scriptsDirectory, script.file), 'utf8'),
    description: script.description,
  });
}

console.info(
  `Provisioned ${lexicons.length} lexicons and ${scripts.length} Lua scripts in HappyView.`,
);
