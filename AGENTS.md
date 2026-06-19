# Repository Guidelines

## Project Structure & Module Organization

Core TypeScript code lives in `src/`. The public API is re-exported from
`src/index.ts`; keep implementation modules under `src/core/`:

- `ast.ts`: serializable score and event types.
- `parser.ts`: JABC text parsing and structured errors.
- `normalize.ts`: AST-to-AST normalization passes.
- `fraction.ts`: reusable duration utilities.
- `pitch.ts`: degree-to-pitch, MIDI, ABC, and MusicXML pitch mapping.

Format converters live under `src/converters/`; each converter must consume the
AST rather than source text.

Playback code lives in `src/playback/`. Keep timeline construction in pure
functions and browser audio scheduling in `web-audio-player.ts`.

Renderers live in `src/renderers/`. They consume `Score` and return serializable
output or use an isolated browser adapter. Do not read JABC source from a
renderer. `staff-renderer.ts` must continue through `toStandardAbc` and keep
abcjs-specific options out of the AST.

The lightweight validation UI lives in `src/web/` with its document shell at
`index.html`. Keep it as an integration layer over exported core APIs.

Tests live in `tests/` and mirror the module they exercise, using names such as
`parser.test.ts`. Generated output belongs in `dist/`. Do not edit or commit
`dist/`, `node_modules/`, or `.npm-cache/`.

## Architecture Overview

Treat the `Score` AST as the boundary between input and future exporters,
renderers, and playback code. Parse JABC once, then implement downstream
features as pure transformations over the AST. Keep browser-dependent code out
of `src/core/`.

## Build, Test, and Development Commands

- `npm install`: install the locked development dependencies.
- `npm test`: run all Vitest tests once.
- `npm run test:watch`: rerun affected tests during development.
- `npm run typecheck`: check source and tests with strict TypeScript settings.
- `npm run build`: emit JavaScript and declarations into `dist/`.

Run tests and type checking before submitting changes.

## Coding Style & Naming Conventions

Use TypeScript ES modules, two-space indentation, semicolons, and double quotes,
matching the existing files. Prefer explicit interfaces for serialized data and
discriminated unions for results and events. Use `camelCase` for functions and
variables, `PascalCase` for types, and descriptive filenames in lowercase.

No formatter or linter is configured. Keep edits focused and preserve the
surrounding style. Avoid browser APIs and hidden mutation in core functions.

## Testing Guidelines

Vitest discovers `tests/**/*.test.ts`. Add tests for every new syntax rule,
normalization rule, and error path. Assert AST structure and source locations,
not implementation details. Parser failures must verify line, column, token,
context, and suggestion where applicable. No coverage threshold is configured;
new behavior is expected to have direct unit coverage.

## Commit & Pull Request Guidelines

No readable Git history is available to establish repository-specific rules.
Use concise, imperative Conventional Commit messages, for example
`feat(parser): support dotted durations` or `fix(core): preserve 4/4 meter`.

Pull requests should describe the behavior change, list validation commands,
and note syntax or AST compatibility impacts. Link relevant issues. Include
screenshots only when a future UI or rendered output changes, and update
`README.md` whenever supported JABC syntax changes.
