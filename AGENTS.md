# Margins Agent Guide

<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

## Product

Margins is a Bible reader with decentralized social commentary. It renders Bible text from USFM and uses ATProto accounts and records so people can organize verse annotations into named commentaries. An annotation contains a Markdown comment; a highlight contains one verse and a color. The source schemas are in [lexicons](packages/atproto/lexicons).

The app is in very early development. Backwards compatibility is not important unless a task explicitly requires it, including for application APIs, persisted SQLite data and schema, and published ATProto lexicons. Prefer the cleanest current design over compatibility layers; breaking migrations and lexicon changes are acceptable.

## Toolchain

- Use pnpm 11 and Node.js 24; versions are declared in [mise.toml](mise.toml).
- `pnpm install` installs dependencies.
- `pnpm dev` runs Vite on `http://127.0.0.1:7654`.
- `pnpm build` creates the static SPA in `dist/`; `pnpm start` serves it with SPA fallback.
- `pnpm check` checks Prettier and `pnpm lint` runs ESLint. `pnpm format` writes formatting and ESLint fixes.
- `pnpm generate-routes` regenerates the TanStack route tree.
- `pnpm lexicons` regenerates TypeScript from the ATProto lexicons.
- There is no test script yet. For code changes, run the narrowest relevant check, then `pnpm check`, `pnpm lint`, and `pnpm build` as appropriate.

See [README.md](README.md) for deployment and TAP operation notes. Prefer [package.json](package.json), [vite.config.ts](app/vite.config.ts), and [.env.example](.env.example) when README scaffold examples disagree with current configuration.

## Architecture

- React 19 and TanStack Router provide file-based client routing and TanStack Query. Vite and the React Compiler build the static SPA.
- Route definitions live in [src/routes/](app/src/routes/). Keep route components thin and move reusable UI to [src/components/](app/src/components/) and server/domain behavior to [src/lib/](app/src/lib/).
- [src/components/usfm/](app/src/components/usfm/) owns USFM parsing and pluggable React rendering. Verse identifiers and parsing belong in [src/lib/bible/verse.ts](packages/bible/src/verse.ts).
- UI messages live in [messages/](app/messages/). Paraglide generates the runtime in `src/paraglide/` during development/build.
- Use the `#/*` alias for imports from `src/`. TypeScript is strict and rejects unused locals and parameters.
- Throw structured `AppError` values from application boundaries; this app runs as a client-only SPA and does not provide TanStack Start server middleware.
- When referencing a verse, use the defined [`VerseId`](src/lib/bible/verse.ts) as a primary ID format whenever relevant.
- ATProto, user identity and sessions, and XRPC are handled via the HappyView packaged all-in-one BFF. It uses configured lexicons and the procedure scripts in [/happyview](happyview).
- Additional annotation query lookups are assisted by a sidecar indexer service, see [indexer](indexer/).

## ATProto Model And Flow

- Treat [lexicons/](packages/atproto/lexicons/) as the source of truth for `com.marginsbible.commentary`, `com.marginsbible.annotation`, and `com.marginsbible.highlight`. Commentary records name collections; annotations reference one or more verses and contain a comment; highlights reference one verse and contain a color.
- Never hand-edit `src/lexicons/`; run `pnpm lexicons`. Import generated builders, parsers, validators, and NSIDs instead of duplicating protocol shapes or collection strings.
- Happyview owns OAuth state/session stores. [app/src/routes/oauth/callback.tsx](app/src/routes/oauth/callback.tsx) completes OAuth by delegating to Happyview.

## Generated And Source Data

Do not manually edit these generated outputs:

- `app/src/routeTree.gen.ts`: regenerate with `pnpm generate-routes`.
- `packages/atproto/src/lexicons/`: regenerate with `pnpm lexicons`.
- `app/src/paraglide/`: regenerate through `pnpm dev` or `pnpm build` after editing [app/messages/](app/messages/) or [app/project.inlang/settings.json](app/project.inlang/settings.json).

## React Development

Follow all React recommended practices and rules consistently.

Do not use `useEffect` for data fetching. Use React Query (with route loader preloading).

Avoid `useEffect` in general.

Never duplicate state. Use derived state as needed.

React Compiler is in use in this project. Refrain from adding memoization and rely on the Compiler.

Fix typechecking errors before calling something complete.

Prefer clean code to preserving existing structures. Refactoring is good and encouraged. When a refactor is significant, shelve the current work, plan it out, and get user confirmation. Deliver the refactor first, then proceed with planned changes. If refactoring first doesn't make sense, consider doing it after the new changes are working. Otherwise, clearly explain the refactor and its impact when summarizing changes.

Keep component prop dependencies light. If a component can get the same data from context or a query, have it get that data itself. This keeps components encapsulated and easy to move around.

After implementing a working component structure, review each component for overall complexity and number of concerns. Refactor and break down components which do more than 2 distinct jobs. Tightly coupled components can live in the same file, loosely coupled ones can be split into different files.

Import design system components from `@a-type/ui` for semantic components. It has most common components. Always favor using design system components with default styling over adding stylesheets.

## Styling

The project uses CSS Modules for styling, with a CSS design system library called Arbor applied to a set of UI components in the `@a-type/ui` library.

Internal for a component should be placed in a CSS Module file with the same name alongside it.
When components are separated into new files, bring their styles along with them to a new CSS module file with the right name.
Styles applied externally to other components rendered as children should live in the module file of the parent which is applying them.
Import `clsx` from `@a-type/ui` to combine class names
Use design system tokens (`--m-...`) for every applicable styling:

- `--m-p` tokens for padding
  - `--m-tint` for primary color range
  - `--m-rd` for radius
  - `--m-dur` for duration
  - `--m-ease` for easing
    And so on.

## Testing

Prefer tests which are decoupled from implementation and focus on end-user visible behaviors. Don't test everything out of obligation. Focus on high-value targets which are unlikely to change much or have particularly high risk of regression.

A bug fix is always a good time to add a regression test - if it happened once, it could again.
