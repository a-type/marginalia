# Marginalia

Marginalia is a Bible reader with decentralized social commentary. Bible text is
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

Start HappyView and the TanStack Start development server:

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

## Production deployment

Set `APP_URL` to the app's exact public HTTPS origin and `APP_DOMAIN` to its
hostname, for example:

```dotenv
APP_URL=https://marginalia.example.com
APP_DOMAIN=marginalia.example.com
```

Set the HappyView secrets in `.env`. The public client key can be added after
the first deployment. Start the stack:

```sh
docker compose up --build -d
```

Sign in to the HappyView dashboard at
`https://marginalia.example.com/api`, create an admin API key with
`settings:manage`, `scripts:manage`, and `backfill:create`, and set it as
`HAPPYVIEW_ADMIN_KEY` in `.env`. Provision the backend:

```sh
docker compose --profile setup run --rm --build happyview-provision
```

Create a **public** HappyView API client whose client ID URL is
`https://marginalia.example.com/oauth-client-metadata.json`, client URI and
allowed origin are `https://marginalia.example.com`, and redirect URI is
`https://marginalia.example.com/oauth/callback`. Set the resulting `hvc_` key
as `VITE_HAPPYVIEW_CLIENT_KEY` in `.env`, then rebuild and restart the app:

```sh
docker compose up --build -d app
```

Caddy terminates TLS and routes `/api/*` to HappyView, rewrites `/xrpc/*` to
`/api/xrpc/*`, and sends all other requests to the TanStack Start app. HappyView
uses `BASE_PATH=/api`; its `PUBLIC_URL` remains the app origin without that
path. The HappyView container is bound to loopback on host port 3001 and is not
directly exposed to the network.

## Backend architecture

- `lexicons/` is the source of truth for Marginalia ATProto records and XRPC
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
