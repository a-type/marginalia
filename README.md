# Margins

Margins is a Bible reader with decentralized social commentary. Bible text is
loaded from USFM, and annotations, highlights, profiles, and follows are stored
as ATProto records.

## Development

The project uses Node.js 24 and the pnpm version pinned in the root
`package.json`. Copy `.env.example` to `.env`, set `HAPPYVIEW_SESSION_SECRET`
to at least 64 random characters, and set `HAPPYVIEW_TOKEN_ENCRYPTION_KEY` to a
base64-encoded 32-byte key. For example:

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
docker compose up --build -d happyview annotation-indexer
```

Start HappyView and the Vite development server:

```sh
docker compose up --build -d happyview annotation-indexer
pnpm install
pnpm --filter @marginsbible/bible build
pnpm exec dotenv -e .env -- pnpm --filter @marginsbible/app dev
```

Open `http://127.0.0.1:7654`. Vite proxies `/api/*` to HappyView and rewrites
root-level `/xrpc/*` requests to HappyView's `/api/xrpc/*` routes. The HappyView
dashboard is available at `http://127.0.0.1:7654/api/dashboard`. The command
above passes the root `.env` to the app; when running the app directly, Vite
instead loads environment files from `app/`. Rebuild the Bible package after
changing its source.

Sign in to the HappyView dashboard and create an admin API key with
`settings:manage`, `scripts:manage`, `lexicons:create`, `backfill:create`,
`api-clients:view`, `api-clients:create`, and `api-clients:edit` permissions.
Set that key as `HAPPYVIEW_ADMIN_KEY` in `.env`, then provision the source
lexicons and Lua query scripts:

```sh
pnpm happyview:provision
```

Initialize the annotation index using the rebuild instructions below before
loading chapter annotations.

When `VITE_HAPPYVIEW_CLIENT_KEY` is unset, provisioning creates a **public**
HappyView API client and prints its `hvc_` key. Add the key to
`VITE_HAPPYVIEW_CLIENT_KEY` in `.env`, then restart Vite. Subsequent
provisioning runs use that key to update the existing client rather than
creating another one. The key is public and is intentionally included in the
browser bundle; never put the HappyView admin API key there.

Each record lexicon is uploaded with backfill enabled, so HappyView starts
indexing existing network records on its first upload. Lexicons and query
scripts can be re-provisioned safely:

```sh
pnpm lexicons
docker compose up --build -d annotation-indexer
pnpm happyview:provision
```

Rebuild the production app image as well after changing lexicon schemas.

## Daily lectionary

Returning visitors can view daily scripture links on the home tab, choose a
lectionary tradition, and browse dates with the calendar. Citations come from
[LectServe](https://www.lectserve.com/html/about). The available options match
its documented support: RCL and ACNA Sundays/feasts, and ACNA Daily Office
using either the civil or liturgical calendar. There is no traditions endpoint.
All three response sections are displayed with their own dates and traditions:
Daily Office, the selected day's services, and Sunday readings. An empty
weekday feast section does not hide Daily Office or upcoming Sunday readings.
Selecting RCL or ACNA changes the Sunday/feast tradition and uses the ACNA civil
Daily Office; selecting a Daily Office calendar uses ACNA Sunday/feast readings.
Links use the selected Bible
translation. Citations which cannot be resolved remain visible as text.
Each reading opens a new Bible reading tab with all cited verses selected.
Discontinuous, optional, cross-chapter, and whole-chapter readings are supported.
Each group also offers **Open all in tabs**, which opens every resolvable
reading in that group and activates the last new tab.

Reader URLs accept a `verses` search parameter containing comma-separated verses
and ranges, such as `?verses=3-8,12` or `?verses=3:8-4:2`. Endpoints without a
chapter use the chapter in the URL. The `start` and `end` tokens refer to the first
and last available verses of a chapter, for example `?verses=10-end` or
`?verses=3:start-4:end`. Ranges resolve against the selected translation.
The first selected verse is primary for scrolling, highlights, and viewing
annotations; starting a new annotation includes the entire selection. Clicking a
verse replaces the URL selection with that single verse, rather than extending it.

Vite and Caddy proxy `/lectserve/date/YYYY-MM-DD` to LectServe's
`/date/YYYY-MM-DD` endpoint because the API does not allow cross-origin browser
requests. Other static hosts must provide the same proxy; the app's static
server alone does not provide it. Reading data is cached in memory by date and
tradition. Book-name aliases live in `app/src/lib/bible/book-names.ts`; add
alternative names to a book's list to reuse the many-to-one resolver elsewhere.

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
`app/public/usfm/eng_asv/`, preserving filenames such as `gen.usfm`. After all
downloads succeed, it saves the complete `extra.json` alongside the books.
The reader derives uppercase book IDs, localized names, chapter counts, and
lowercase USFM filenames directly from this metadata. The standard 66 books
are placed in Bible order, followed by any additional books; no separate
translation manifest is needed.

Use `--output <directory>` to override the `app/public/usfm` destination root.
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
`settings:manage`, `scripts:manage`, `lexicons:create`, `backfill:create`,
`api-clients:view`, `api-clients:create`, and `api-clients:edit`, and set it as
`HAPPYVIEW_ADMIN_KEY` in `.env`. Provision the backend:

```sh
docker compose --profile setup run --rm --build happyview-provision
```

If `VITE_HAPPYVIEW_CLIENT_KEY` is unset, provisioning creates a **public**
HappyView API client for `APP_URL` and prints its `hvc_` key. Set the key as
`VITE_HAPPYVIEW_CLIENT_KEY` in `.env`, then rebuild and restart the app:

```sh
docker compose up --build -d app
```

Caddy terminates TLS and routes `/api/*` to HappyView, rewrites `/xrpc/*` to
`/api/xrpc/*`, and sends all other requests to the static SPA server. The app
image serves Vite's `app/dist/` output with history fallback for direct route
loads.
OAuth client metadata is generated during the build, so changing `APP_URL`
requires rebuilding the app. HappyView uses `BASE_PATH=/api`; its `PUBLIC_URL`
remains the app origin without that path. The HappyView container is bound to
loopback on host port 3001 and is not directly exposed to the network.

## Railway deployment

`.railway/railway.ts` configures the app, HappyView, the annotation indexer,
Caddy, and separate persistent volumes for both SQLite databases. The app and
indexer Dockerfiles build their workspace dependencies from the repository
root. Only Caddy has a public domain: `marginsbible.com` on port 80. Railway
terminates public TLS, while Caddy routes requests to the other services over
Railway's private network. HappyView's
`PUBLIC_URL`, Caddy's private upstreams, and its `/api` path use Railway
reference variables so they stay aligned with the source service settings.

Set `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` on the Railway `happyview`
service before deploying. Set `VITE_HAPPYVIEW_CLIENT_KEY` on `margins` after
creating the public HappyView API client; this key is included in the browser
build and is intentionally public. The IaC config preserves these values when
planning subsequent changes.

### Private annotation indexer

The `annotation-indexer` service uses Node.js 24's built-in SQLite driver.
Its image contains the indexer's TypeScript source (run with Node's native
type stripping), built shared ATProto/Bible packages, and only their production
npm dependencies. `pnpm deploy --prod --legacy` creates a self-contained
dependency tree without requiring changes to the workspace's dependency-linking
configuration. Package file allowlists exclude tests, local data, and secrets;
frontend and development dependencies remain in the build stage.
It has no public domain, published container
port, or Caddy route. Its unauthenticated HTTP API is for trusted private
services only; do not expose it through public ingress.

HappyView record hooks forward annotation and follow creates, updates, and
deletes to the indexer. A write is acknowledged only after the projection
transaction commits. The chapter XRPC query continues to authenticate through
HappyView, forwarding only `caller_did`, the book, and the chapter. The
indexer resolves self/followed authors and exact chapter membership in SQL
before loading documents. Cross-book and noncontiguous verse selections work;
blank comments and invalid records are logged and excluded. Results retain
newest-first ordering, ascending URI ties, and the existing all-results shape.
Highlights and the caller's annotation sync endpoint still use HappyView.

Provisioning substitutes `ANNOTATION_INDEXER_URL` into the Lua scripts. For
Compose, the default is `http://annotation-indexer:3000`. For Railway, set it
to `http://annotation-indexer.railway.internal:3000` (or the service's actual
private domain) in the environment running `pnpm happyview:provision`.
Changing this address requires re-provisioning. The indexer listens on `::`
to support Railway's private IPv6 network. Keep it at one replica with its
own persistent volume; never mount HappyView's live database into it.

#### Initial indexing and reconciliation

Deploy the indexer, then provision HappyView's hooks and queries. Hooks are
installed before collection backfill is enabled. Re-provisioning an existing
lexicon does not replay its existing records into the sidecar, so initialize
the index explicitly. The indexer returns an error, not a misleading empty
chapter, until its first successful rebuild. `GET /health` reports `ready`.

The rebuild command needs a HappyView admin key with `records:read` in
addition to the permissions used by provisioning. In Compose:

```sh
docker compose --profile setup run --rm --build annotation-indexer-rebuild
```

In Railway, run the command **inside the private network**, for
example from an SSH shell in the indexer service:

```sh
HAPPYVIEW_BASE_URL=http://happyview.railway.internal:3000/api \
HAPPYVIEW_ADMIN_KEY='<admin key with records:read>' \
ANNOTATION_INDEXER_URL=http://127.0.0.1:3000 \
node src/rebuild-main.ts
```

For local development without Docker, build the indexer and its shared
packages, then start the indexer:

```sh
pnpm --filter '@marginsbible/indexer...' --recursive build
INDEXER_DATABASE_PATH=/path/to/index.sqlite HOST=127.0.0.1 PORT=3002 \
  pnpm --filter @marginsbible/indexer start
```

Set `ANNOTATION_INDEXER_URL` to an address reachable by both HappyView and the
rebuild command. Run the rebuild with the root `.env` settings:

```sh
pnpm exec dotenv -e .env -- pnpm --filter @marginsbible/indexer rebuild-indexes
```

Rebuilds stage a full export and atomically replace the live projection,
including removal of records no longer in HappyView. Existing reads remain
available during export. **Run with ingestion/backfills quiescent:** HappyView
v2.15's admin export uses offset pagination, not a stable snapshot. If a
record hook arrives during export, the rebuild refuses to publish, preserves
the live index, and reports a conflict. Retry after activity has stopped.
Also pause other administrative record changes during export; they do not
necessarily invoke hooks. A failed/interrupted export leaves the live data
intact and can be restarted with the same command.

HappyView's hook delivery is eventual, retries failures, and ultimately fails
open with a dead-letter event. Monitor and replay hook failures in HappyView;
an indexer outage must not be treated as a successful query with empty results.
Run a rebuild after missed events, administrative deletions, or index loss.
There is no distributed transaction between the services: ingestion can
temporarily lead or lag HappyView storage. A rebuild reconciles against
HappyView's stored records.

The index stores full annotation documents plus exact chapter memberships
and follow edges. Its author/creation-time index prepares for a future
followed-user feed, but no feed API is implemented here.

## Progressive web app

`vite-plugin-pwa` generates the web app manifest and a Workbox service worker
during the app build. The static app shell links the manifest and install icons,
and the plugin injects its service-worker registration script. Service workers
are disabled in development; to test installation on `http://127.0.0.1:3000`,
build with that origin and start the static app server:

```sh
APP_URL=http://127.0.0.1:3000 pnpm --filter '@marginsbible/app...' --recursive build
pnpm --filter @marginsbible/app start
```

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

The icons are intentionally blank white squares. Replace `app/public/icon.svg`
and run `pnpm --filter @marginsbible/app pwa-assets` to regenerate the PNG
install icons, Apple touch icon, and favicon using `@vite-pwa/assets-generator`.

## Backend architecture

- `packages/atproto/lexicons/` is the source of truth for Margins ATProto
  records and XRPC query methods. Run `pnpm lexicons` to regenerate the shared
  package's `src/lexicons/` and the app's `app/src/lexicons/`.
- `happyview/lua/` contains custom HappyView query scripts for chapter records
  and batched profile lookup, plus annotation/follow indexing hooks.
  `scripts/provision-happyview.mjs` uploads these
  along with the lexicons through HappyView's admin API.
- HappyView owns OAuth token handling, DPoP authentication, record indexing,
  Jetstream sync, backfill, and XRPC reads/writes. The browser uses
  `@happyview/oauth-client-browser` and `@happyview/lex-agent`.
- The Bible reader keeps pending annotations and highlights in browser storage
  for offline use; HappyView is the authoritative remote record index.
- `indexer/` owns the private, rebuildable SQLite projection used by the
  chapter annotation query. `Indexer.Dockerfile` builds its shared workspace
  dependencies and deploys its source plus an isolated production dependency
  tree, without the frontend or development tools.

## Checks

```sh
pnpm --filter '@marginsbible/app...' --recursive build
pnpm --filter '@marginsbible/indexer...' --recursive build
pnpm --filter @marginsbible/app test
pnpm --filter @marginsbible/bible exec vitest run
pnpm --filter @marginsbible/indexer exec vitest run
pnpm --filter @marginsbible/indexer exec vitest run --root .. scripts
pnpm check
pnpm lint
```

## Localization

Messages live in `app/messages/`. Paraglide generates runtime files under
`app/src/paraglide/` during development and builds.
