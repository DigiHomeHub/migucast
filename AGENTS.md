# AGENTS.md

## Project Overview

`migucast` is a TypeScript rewrite of the original Migu IPTV bridge. It fetches live TV and sports data, builds IPTV artifacts, and serves them through:

- a Node.js HTTP server in `src/app.ts`
- a Cloudflare Workers entry point in `src/worker.ts`

The same core business logic is shared across both runtimes through the platform abstraction layer in `src/platform/`.

## Stack and Runtime Expectations

- Node.js `>= 20`
- TypeScript with strict typing and ESM only
- `pnpm` as the package manager
- Zod for runtime validation and config parsing
- Vitest for unit, integration, and smoke coverage
- ESLint + Prettier + `tsc --noEmit` as mandatory quality gates

## Architecture Rules

### Shared Logic First

Prefer implementing business logic in shared modules under `src/` so Node and Workers stay behaviorally aligned.

- Node-specific wiring belongs in `src/app.ts` and `src/platform/node.ts`
- Workers-specific wiring belongs in `src/worker.ts`, `src/platform/workers.ts`, and `src/workers/`
- Shared request, playlist, channel, and update logic belongs in `src/utils/`, `src/api/`, and `src/platform/context.ts`

### Respect the Platform Abstractions

Do not bypass the storage, cache, or logger adapters.

- Use `initPlatform(...)` to register runtime adapters
- Use `getStorage()` and `getCache()` from `src/platform/context.ts`
- Keep filesystem access in Node adapters and KV access in Workers adapters

### Keep Node and Workers Semantics Consistent

Any change to routing, auth, playlist generation, cache behavior, or update flow should be checked in both runtimes.

Current behavior that must remain consistent unless intentionally changed:

- password-based route prefixing via `mpass`
- optional `/:userId/:token/...` URL credential override
- playlist routes serving M3U, TXT, and XMLTV data
- channel requests returning `302` redirects when playback URLs resolve successfully

### Preserve the Storage Contract

The project relies on stable storage keys and placeholder replacement.

- Playlist keys: `playlist:m3u`, `playlist:txt`
- EPG key: `epg:xml`
- Playlist templates use the literal placeholder `${replace}`
- Host substitution is resolved at response time, not when writing stored content

### Config Changes Must Flow Through Zod

All runtime configuration is defined in `src/config.ts`.

- Add new config through `AppConfigSchema`
- Map external env vars through `mapEnvToConfigInput`
- Preserve the `m...` env naming convention unless there is a deliberate migration
- Update both README docs and tests when configuration changes

## Coding Standards

### Test-First by Default

Follow a red-green-refactor workflow for non-trivial changes.

- Start with a failing test when fixing bugs or adding features
- Keep tests readable and close to observable behavior
- Prefer unit tests for pure logic and adapter contracts
- Use integration tests for request/response flows

### Type Safety Is a Hard Requirement

- Avoid `any`
- Prefer explicit parameter and return types
- Use Zod schemas and inferred types for untrusted data
- Keep production code stricter than tests

### Comments and Logs

- Write comments and logs in idiomatic English
- Comments should explain intent or rationale, not restate obvious code
- Keep structured logging intact when changing update or request flows

### File Size and Complexity

- Aim to keep TypeScript files under 400 lines
- Re-evaluate decomposition before a file exceeds 400 lines
- Treat files over 500 lines as refactor candidates

### No Unnecessary Invention

- Do not remove unrelated behavior
- Do not rename public routes, storage keys, or config fields without a concrete reason
- Do not introduce speculative abstractions

## Testing and Verification

Run the smallest relevant checks first, then broader validation as needed.

Core commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:smoke
pnpm build
```

Testing notes:

- `vitest.config.ts` excludes `tests/smoke/**` from the default test run
- Smoke coverage lives in `tests/smoke/`
- Coverage thresholds are enforced in Vitest
- When changing Workers code, keep `src/worker.ts` compatible with the current TypeScript setup, which intentionally avoids depending on Workers types in the main tsconfig

## Project-Specific Implementation Notes

### Request Handling

- Shared request logic lives in `src/utils/request_handler.ts`
- Playlist responses perform host replacement using request headers and configured `mhost`
- Channel resolution uses cache-first lookup, then upstream fetch, then redirect resolution

### Data Update Flow

- The main update orchestration lives in `src/utils/update_data.ts`
- TV and sports updates are separate pipelines
- Node runs updates on an interval from `src/app.ts`
- Workers run scheduled chunked updates from `src/workers/chunked_update.ts`

### External Boundaries

Mock only true external boundaries in tests:

- HTTP requests
- filesystem access
- Cloudflare KV

Do not mock internal project logic when a real unit or integration test is practical.

## Git and Change Management

- Do not commit directly to `main`
- Preferred feature branch format: `feature/<issue-id>-<short-description>`
- Use conventional commit style: `type(scope): description`
- Keep commits focused and reviewable

## Agent Workflow for This Repository

1. Read the affected runtime entry points and the shared module before editing.
2. Verify whether the change impacts both Node and Workers.
3. Add or update tests first for meaningful behavior changes.
4. Implement the smallest complete change.
5. Run targeted checks, then broader validation if the change touches shared behavior.
6. Update documentation when public behavior, configuration, or deployment steps change.

## Local State

Do not commit agent memory, scratch context, or other machine-local working files to this repository.

## When Unsure

- Prefer matching the existing architecture over introducing a new pattern
- Prefer shared modules over runtime-specific duplication
- Prefer explicit validation over assumptions
- Prefer small, fully tested changes over broad refactors
