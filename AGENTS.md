# Apostil Agent Guide

## Product

Apostil is a Bible reader with decentralized social commentary. It renders Bible text from USFM and uses ATProto accounts and records so people can organize verse annotations into named commentaries. An annotation contains a Markdown comment; a highlight contains one verse and a color. The source schemas are in [lexicons/](lexicons/).

The app is in very early development. Backwards compatibility is not important unless a task explicitly requires it, including for application APIs, persisted SQLite data and schema, and published ATProto lexicons. Prefer the cleanest current design over compatibility layers; breaking migrations and lexicon changes are acceptable.

## Toolchain

- Use pnpm 11 and Node.js 24; versions are declared in [mise.toml](mise.toml).
- `pnpm install` installs dependencies.
- `pnpm dev` runs Vite on `http://127.0.0.1:7654`.
- `pnpm build` creates the Nitro production bundle; `pnpm start` runs it.
- `pnpm check` checks Prettier and `pnpm lint` runs ESLint. `pnpm format` writes formatting and ESLint fixes.
- `pnpm generate-routes` regenerates the TanStack route tree.
- `pnpm lexicons` regenerates TypeScript from the ATProto lexicons.
- There is no test script yet. For code changes, run the narrowest relevant check, then `pnpm check`, `pnpm lint`, and `pnpm build` as appropriate.

See [README.md](README.md) for deployment and TAP operation notes. Prefer [package.json](package.json), [vite.config.ts](vite.config.ts), and [.env.example](.env.example) when README scaffold examples disagree with current configuration.

## Architecture

- React 19 and TanStack Start provide SSR, server functions, TanStack Router file routes, and TanStack Query. Nitro supplies the production server; Vite and the React Compiler build the app.
- Route definitions live in [src/routes/](src/routes/). Keep route components thin and move reusable UI to [src/components/](src/components/) and server/domain behavior to [src/lib/](src/lib/).
- [src/components/usfm/](src/components/usfm/) owns USFM parsing and pluggable React rendering. Verse identifiers and parsing belong in [src/lib/bible/verse.ts](src/lib/bible/verse.ts).
- SQLite is accessed through Kysely in [src/db.ts](src/db.ts). Schema changes belong in [src/db.migrations.ts](src/db.migrations.ts); reusable data operations belong in [src/lib/db/queries.ts](src/lib/db/queries.ts).
- UI messages live in [messages/](messages/). Paraglide generates the runtime in `src/paraglide/` during development/build.
- Use the `#/*` alias for imports from `src/`. TypeScript is strict and rejects unused locals and parameters.
- Throw structured `AppError` values from application boundaries; global handling and logging are configured in [src/start.ts](src/start.ts).
- When referencing a verse, use the defined [`VerseId`](src/lib/bible/verse.ts) as a primary ID format whenever relevant.

## ATProto Model And Flow

- Treat [lexicons/](lexicons/) as the source of truth for `com.apostilbible.commentary`, `com.apostilbible.annotation`, and `com.apostilbible.highlight`. Commentary records name collections; annotations reference one or more verses and contain a comment; highlights reference one verse and contain a color.
- Never hand-edit `src/lexicons/`; run `pnpm lexicons`. Import generated builders, parsers, validators, and NSIDs instead of duplicating protocol shapes or collection strings.
- [src/lib/atproto/server.ts](src/lib/atproto/server.ts) owns `NodeOAuthClient` configuration and Kysely-backed OAuth state/session stores. [src/routes/oauth/callback.tsx](src/routes/oauth/callback.tsx) completes OAuth, resolves the repository handle, upserts the account, and creates the app cookie session.
- `APP_URL` must be the exact public origin used for OAuth. Local OAuth requires `127.0.0.1`, not `localhost`; for the current Vite config use `http://127.0.0.1:7654`. `SESSION_PASSWORD` must be at least 32 characters. Do not expose either session data or secrets to client modules.
- TAP delivers repository events to `POST /api/tap/webhook`. Keep transport authorization and event unwrapping in [src/lib/tap/server.ts](src/lib/tap/server.ts), and keep database queries in [src/lib/db/queries.ts](src/lib/db/queries.ts) independent of TAP event types.
- Validate incoming records with generated `$parse` functions and validate verse IDs before persistence. Preserve protocol field casing such as `authorDid`, `commentaryId`, and `createdAt` in lexicon-backed database models.
- SQLite commentary and annotation tables are a queryable local projection of ATProto records. Preserve AT URIs, CIDs, author DIDs, record keys, raw record JSON, and idempotent upsert/delete behavior. Annotation and verse rows must be updated transactionally.
- `TAP_ADMIN_PASSWORD` is optional; when configured, the webhook must continue to verify TAP Basic authentication.

## Generated And Source Data

Do not manually edit these generated outputs:

- `src/routeTree.gen.ts`: regenerate with `pnpm generate-routes`.
- `src/lexicons/`: regenerate with `pnpm lexicons`.
- `src/paraglide/`: regenerate through `pnpm dev` or `pnpm build` after editing [messages/](messages/) or [project.inlang/settings.json](project.inlang/settings.json).

Bible source files under `src/data/usfm-source/` are imported as raw text. Avoid reformatting or bulk-editing this corpus as part of unrelated changes.

## React Development

Follow all React recommended practices and rules consistently.

- Do not use `useEffect` for data fetching. Use React Query (with route loader preloading).
- Avoid `useEffect` in general.
- Never duplicate state. Use derived state as needed.

React Compiler is in use in this project. Refrain from adding memoization and rely on the Compiler.

Fix typechecking errors before calling something complete.

Prefer clean code to preserving existing structures. Refactoring is good and encouraged. When a refactor is significant, shelve the current work, plan it out, and get user confirmation. Deliver the refactor first, then proceed with planned changes. If refactoring first doesn't make sense, consider doing it after the new changes are working. Otherwise, clearly explain the refactor and its impact when summarizing changes.

## Styling

The project uses CSS Modules for styling, with a CSS design system library called Arbor applied to a set of UI components in the `@a-type/ui` library.

- Internal for a component should be placed in a CSS Module file with the same name alongside it.
- Styles applied externally to other components rendered as children should live in the module file of the parent which is applying them.

## Testing

Prefer tests which are decoupled from implementation and focus on end-user visible behaviors. Don't test everything out of obligation. Focus on high-value targets which are unlikely to change much or have particularly high risk of regression.

A bug fix is always a good time to add a regression test - if it happened once, it could again.
