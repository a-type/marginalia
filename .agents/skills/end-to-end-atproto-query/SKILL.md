---
name: end-to-end-atproto-query
description: >
  Create or change an end-to-end ATProto query in Apostil. Use when adding a
  query lexicon or wiring a query through HappyView Lua, provisioning, server
  functions, and TanStack React Query queryOptions.
---

# End-to-End ATProto Query Workflow

Use this workflow when a query must be available through Apostil's HappyView
XRPC service and consumed by the application. Keep the lexicon, Lua result,
server function, and React Query result shape aligned.

## 1. Trace The Existing Pattern

- Read the relevant record lexicon, a nearby query lexicon, and the closest
  implementation in `happyview/lua/`, `src/lib/`, `src/queries/`, and
  `scripts/provision-happyview.mjs`.
- Confirm whether the query is caller-scoped or public, which collection it
  reads, and the exact records or response shape its caller expects.
- Reuse the existing XRPC helpers and generated lexicon modules. Do not create
  duplicate collection IDs, NSIDs, validators, or pagination conventions.

## 2. Define The Query Lexicon

- Add or update the query JSON in `lexicons/` using the canonical NSID as its
  filename and `id`.
- Declare every accepted parameter and the output record/object shape in the
  lexicon. Use the actual wire casing and ATProto formats used by the records.
- If the query takes no inputs, define the query without inventing parameters;
  rely on `caller_did` for authenticated caller scope when appropriate.
- Regenerate TypeScript with `pnpm lexicons`. Never hand-edit `src/lexicons/`.

## 3. Implement The HappyView Lua Query

- Add a Lua file under `happyview/lua/` with a `handle()` function. The script
  ID used at provisioning must be `xrpc.query:<lexicon-nsid>`.
- Use HappyView's `caller_did` for authenticated caller scope. Return the
  lexicon-compatible empty result for unauthenticated callers when that is the
  established behavior; never accept a caller DID parameter as authorization.
- Read records with `db.query`, using the target collection and validated
  lexicon parameters. Page through all results when the query contract requires
  all records: use a bounded page limit, advance the cursor, and reject a
  repeated cursor.
- Return a records envelope using `toarray(records)` where the XRPC client
  expects record pages. Validate inputs before using them in query filters or
  SQL. Do not concatenate untrusted values into raw SQL.
- Keep the returned fields and record validation consistent with the generated
  lexicon and the TypeScript server function.

## 4. Register Provisioning

Update `scripts/provision-happyview.mjs` in both places needed by the query:

- Add `[queryNsid, targetCollection]` to `queryTargets` when the query must be
  associated with an indexed collection. Use the exact collection read by the
  script.
- Add a `scripts` entry with ID `xrpc.query:<queryNsid>`, the Lua filename, and
  a useful description.

The provisioning loop installs both lexicons and scripts. Do not manually
register the query elsewhere unless the current HappyView setup requires an
additional deployment surface. Do not run `pnpm happyview:provision` against a
live service unless explicitly requested.

## 5. Add The Server Query Function

- Implement the function in the owning module under `src/lib/` and export it
  for the query options module. Keep transport/session handling in the
  appropriate ATProto helper boundary.
- Import generated lexicon NSIDs, parsers, builders, or validators instead of
  duplicating protocol identifiers and record shapes.
- Validate input at the application boundary, enforce authentication where
  required, parse returned records, and return a typed application-level value.
  Skip or report malformed records consistently with nearby code.
- Use the existing HappyView XRPC helpers for pagination and request behavior;
  keep query/domain code out of UI components.

## 6. Define React Query Options

- Add an exported `queryOptions` definition in the owning module under
  `src/queries/` and call it from consumers rather than duplicating keys or
  query functions.
- Use a stable key rooted in the domain, such as `['social', 'followed']`.
  Include every input that changes the result in the key, and pass that same
  input to the server function.
- Follow nearby conventions for whether options are constants or factories.
  Invalidate the new key after mutations that can change its result.
- Keep UI components thin; use the shared options with `useQuery` or route
  loader prefetching as appropriate.

## 7. Verify The Whole Contract

- Add focused tests for input validation, authenticated and unauthenticated
  behavior as relevant, pagination, result parsing, and meaningful query
  filtering. Prefer observable behavior over implementation-only assertions.
- Check provisioning JavaScript with `node --check scripts/provision-happyview.mjs`.
- Run `pnpm lexicons` after lexicon edits, focused Vitest tests, `pnpm lint`, and
  `pnpm check` for changed files or the repository as appropriate. Run
  `pnpm build` for changes that affect server/client boundaries.
- Run a Lua syntax check if a Lua interpreter or project checker is available.
  If none is installed, state that limitation rather than claiming the script
  was syntax-checked.
- Review that the lexicon NSID, provisioning target, script ID, Lua collection,
  server query call, and React Query key all describe the same query.
