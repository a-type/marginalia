# Margins

Margins is a Bible reader with decentralized social commentary. Bible text is
loaded from USFM, and annotations, highlights, profiles, and follows are stored
as ATProto records.

## Development

The project uses Node.js 24 and pnpm 11. Copy `.env.example` to `.env`, set
`HAPPYVIEW_SESSION_SECRET` to at least 64 random characters, and set
`HAPPYVIEW_TOKEN_ENCRYPTION_KEY` to a base64-encoded 32-byte key. For example:

```sh
openssl rand -base64 48
openssl rand -base64 32
```

HappyView v2.14 or newer is required for authenticated repository writes. The
provisioning command enables service-proxy routing, preserves the existing
proxy mode, and adds `com.atproto.repo.putRecord` to an allowlist when needed.
It stops with an error if the proxy policy explicitly blocks repository writes.
If you already have a `.env`, set
`HAPPYVIEW_VERSION=2.15.0`, then pull and restart HappyView before provisioning:

```sh
docker compose pull happyview
docker compose up -d happyview
```

Start HappyView and the Vite development server:

```sh
docker compose up -d happyview
pnpm install
pnpm dev
```

Open `http://127.0.0.1:7654`. Vite proxies `/api/*` to HappyView and rewrites
root-level `/xrpc/*` requests to HappyView's `/api/xrpc/*` routes. The HappyView
dashboard is available at `http://127.0.0.1:7654/api/dashboard`.

Sign in to the HappyView dashboard and create an admin API key with
`settings:manage`, `scripts:manage`, and `backfill:create` permissions. Set that
key as `HAPPYVIEW_ADMIN_KEY` in `.env`, then provision the source lexicons and
Lua query scripts:

```sh
pnpm happyview:provision
```

Create a **public** HappyView API client for the app. Set its app URI and allowed
origin to `http://127.0.0.1:7654`, and its redirect URI to
`http://127.0.0.1:7654/oauth/callback`. Use the `client_id` returned by
`http://127.0.0.1:7654/oauth-client-metadata.json` as its Client ID URL. Put the
resulting `hvc_` client key in `VITE_HAPPYVIEW_CLIENT_KEY` in `.env`, then
restart Vite. The key is public and is intentionally included in the browser
bundle; never put the HappyView admin API key there.

Each record lexicon is uploaded with backfill enabled, so HappyView starts
indexing existing network records on its first upload. Lexicons and query
scripts can be re-provisioned safely:

```sh
pnpm lexicons
pnpm happyview:provision
```

## Downloading USFM sources

Settings includes a searchable Fetch Bible catalog with language filtering and
direct on-device downloads. Only editions whose declared licenses permit
commercial use are offered; missing, unknown, noncommercial, quantity-limited,
or otherwise restricted terms are excluded. This policy is also enforced when
loading remote metadata, not just in the catalog UI, and cannot be disabled.
Results and translation settings link to publisher attribution and license
terms, including attribution, share-alike, and no-derivatives requirements.
Downloaded editions retain this information in IndexedDB for offline access.
Bundled editions remain available without contacting Fetch Bible.

Download a translation from [Fetch Bible](https://v1.fetch.bible):

```sh
pnpm usfm:download eng_asv
```

This downloads every book listed in the translation's `extra.json` to
`public/usfm/eng_asv/`, preserving filenames such as `gen.usfm`. After all
downloads succeed, it saves the complete `extra.json` alongside the books.
The reader derives uppercase book IDs, localized names, chapter counts, and
lowercase USFM filenames directly from this metadata. The standard 66 books
are placed in Bible order, followed by any additional books; no separate
translation manifest is needed.

Use `--output <directory>` to override the `public/usfm` destination root.
Running the command again overwrites the downloaded files. Downloading
sources does not register a new translation in the reader's built-in catalog,
which supplies edition titles that are not included in `extra.json`.

## Production deployment

Set `APP_URL` to the app's exact public HTTPS origin and `APP_DOMAIN` to its
hostname, for example:

```dotenv
APP_URL=https://margins.example.com
APP_DOMAIN=margins.example.com
```

Set the HappyView secrets in `.env`. The public client key can be added after
the first deployment. Start the stack:

```sh
docker compose up --build -d
```

Sign in to the HappyView dashboard at
`https://margins.example.com/api`, create an admin API key with
`settings:manage`, `scripts:manage`, and `backfill:create`, and set it as
`HAPPYVIEW_ADMIN_KEY` in `.env`. Provision the backend:

```sh
docker compose --profile setup run --rm --build happyview-provision
```

Create a **public** HappyView API client whose client ID URL is
`https://margins.example.com/oauth-client-metadata.json`, client URI and
allowed origin are `https://margins.example.com`, and redirect URI is
`https://margins.example.com/oauth/callback`. Set the resulting `hvc_` key
as `VITE_HAPPYVIEW_CLIENT_KEY` in `.env`, then rebuild and restart the app:

```sh
docker compose up --build -d app
```

Caddy terminates TLS and routes `/api/*` to HappyView, rewrites `/xrpc/*` to
`/api/xrpc/*`, and sends all other requests to the static SPA server. The app
image serves Vite's `dist/` output with history fallback for direct route loads.
OAuth client metadata is generated during the build, so changing `APP_URL`
requires rebuilding the app. HappyView uses `BASE_PATH=/api`; its `PUBLIC_URL`
remains the app origin without that path. The HappyView container is bound to
loopback on host port 3001 and is not directly exposed to the network.

## Railway deployment

`.railway/railway.ts` configures the app, HappyView, Caddy, and a persistent
volume for HappyView's SQLite database. Only Caddy has a public domain:
`marginsbible.com` on port 80. Railway terminates public TLS, while Caddy routes
requests to the other services over Railway's private network. HappyView's
`PUBLIC_URL`, Caddy's private upstreams, and its `/api` path use Railway
reference variables so they stay aligned with the source service settings.

Set `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` on the Railway `happyview`
service before deploying. Set `VITE_HAPPYVIEW_CLIENT_KEY` on `margins` after
creating the public HappyView API client; this key is included in the browser
build and is intentionally public. The IaC config preserves these values when
planning subsequent changes.

## Progressive web app

`vite-plugin-pwa` generates the web app manifest and a Workbox service worker
during `pnpm build`. The static app shell links the manifest and install icons,
and the plugin injects its service-worker registration script. Service workers
are disabled in development; use `pnpm build` followed by `pnpm start` to test
installation on `http://127.0.0.1:3000` (or use HTTPS in production).

The worker precaches the app shell and built JavaScript, CSS, and fonts, allowing
offline app launch and route navigation. OAuth and API requests remain
network-only. Translation text already stored in the browser can be read while
the app is open. Browser-managed IndexedDB stores downloaded USFM and prepared
verse text; storage can be evicted and is not a backup.

WEB starts downloading in the background by default. Deleting WEB suppresses
future automatic downloads until the user explicitly downloads it again. Other
known translations are fetched a book at a time for ordinary reading; use
Settings > Translations to download one for offline reading and local search.
Search preparation is separate from downloading, can be retried without a
network connection, and does not block reading. Search runs locally in a
worker: unquoted words are ANDed, quoted text matches an exact token phrase,
and matches stay within one verse. Results are ordered by the selected edition's
book order. ZIP archives of USFM books and whole-Bible USFM files can be
imported locally; partial editions are supported.

Updates take effect after all app tabs/windows are closed, without forcing a
reload while someone is writing.

The icons are intentionally blank white squares. Replace `public/icon.svg` and
run `pnpm pwa-assets` to regenerate the PNG install icons, Apple touch icon, and
favicon using `@vite-pwa/assets-generator`.

## Backend architecture

- `lexicons/` is the source of truth for Margins ATProto records and XRPC
  query methods. Run `pnpm lexicons` to regenerate `src/lexicons/`.
- `happyview/lua/` contains custom HappyView query scripts for chapter records
  and batched profile lookup. `scripts/provision-happyview.mjs` uploads these
  along with the lexicons through HappyView's admin API.
- HappyView owns OAuth token handling, DPoP authentication, record indexing,
  Jetstream sync, backfill, and XRPC reads/writes. The browser uses
  `@happyview/oauth-client-browser` and `@happyview/lex-agent`.
- The Bible reader keeps pending annotations and highlights in browser storage
  for offline use; HappyView is the authoritative remote record index.

## Checks

```sh
pnpm test
pnpm check
pnpm lint
pnpm build
```

## Localization

Messages live in `project.inlang/messages`. Paraglide generates runtime files
under `src/paraglide/` during development and builds.
