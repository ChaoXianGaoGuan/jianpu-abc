# AI Handoff

This document is the first file future AI agents should read before changing JianpuABC.
It summarizes the current architecture, project status, safe workflow, and next priorities.

## Project identity

- Product/project name: **JianpuABC**
- Source text format: **JABC** / Jianpu ABC
- Repository: `https://github.com/ChaoXianGaoGuan/jianpu-abc`
- Package name: `jianpu-abc`
- Goal: provide an ABC-style text notation toolkit for numbered musical notation, including parsing, AST normalization, ABC export, MusicXML export, playback scheduling, Web Audio playback, SVG jianpu rendering, and staff rendering.

## Read these files first

1. `AGENTS.md` - contribution and architecture rules. Follow this file strictly.
2. `README.md` - project overview, setup, supported syntax, public API examples.
3. `docs/jabc-syntax.md` - current language grammar and parser behavior.
4. `docs/ast.md` - AST boundary and data model.
5. `ROADMAP.md` - next feature priorities.
6. `DECISIONS.md` - design decisions that should not be casually changed.

## Current architecture

```text
JABC source text
  -> parseJabc
  -> Score AST
  -> normalizeScore
  -> converters / playback / renderers
```

The AST is the boundary between input syntax and all downstream outputs.
Converters, playback builders, and renderers must consume the AST. They must not parse raw JABC source text directly.

Important source directories:

```text
src/core/        AST, parser, normalization, fractions, pitch mapping
src/converters/  Standard ABC and MusicXML exporters
src/playback/    Pure playback event scheduling and Web Audio player
src/renderers/   SVG jianpu renderer and abcjs staff adapter
src/library/     Repository-backed JABC scores grouped by category directory
src/web/         Lightweight browser validation UI
tests/           Vitest tests
```

## Current implemented capabilities

The current project supports:

- JABC headers: `X:`, `T:`, `C:`, `M:`, `L:`, `Q:`, `K:`, `V:`, `w:`.
- Notes `1` through `7`, rests `0` / `z`, extension `-`.
- Accidentals: `#`, `##`, `b`, `bb`, `=`.
- Octave suffixes: `1'`, `1''`, `1,`, `1,,`.
- Duration suffixes: `/`, `/2`, `/4`, `*2`, `*3`, etc.
- Dots: `.` and `..`.
- Barline/repeat syntax: `|`, `||`, `|]`, `[|`, `|:`, `:|`, `[1`, `[2`.
- Multi-voice parsing with `V:` and inline `[V:voiceId]`.
- Tie markers: `1~` and `~1`.
- Slur markers: `(1` and `3)`.
- Basic triplets: `(3` applies a 3-in-the-time-of-2 duration ratio to the next three notes/rests.
- Inline key changes such as `[K:G jianpu]` across export, playback, and rendering.
- Standard ABC export.
- Native MusicXML 4.0 partwise export.
- Pure playback planning with metronome accents, optional meter-aware count-in plans, ties, triplets, repeats, first/second endings, rests, extensions, and multiple voices.
- Web Audio playback with independent live instrument/metronome gain, sampled guitar and piano instruments, a synth preset, and synthesized fallback.
- SVG jianpu rendering with source-row layout preservation, aligned measure columns, duration grouping, graphical repeats, and SVG relation curves.
- Staff rendering through `toStandardAbc` and abcjs.
- Browser validation UI with a single jianpu/staff preview switch, optional one-measure full-score count-in, separate playback/editor-caret highlighting, right-click JABC token navigation, SVG/PNG score downloads, instrument selection, and copy/download actions for ABC and MusicXML.
- Read-only built-in JABC library with build-time discovery, search, category filtering, and dirty-editor confirmation.

## Commands to run before committing

Always run these commands before a commit that changes source code, syntax, tests, or docs:

```bash
npm test
npm run typecheck
npm run build
```

Current expected state after the latest development pass:

```text
Test files: 15 passed
Tests: 205 passed
Typecheck: passes
Build: passes
```

If these numbers change because new tests were added, update this document or mention the new count in the commit/PR notes.

## Do not edit generated or vendor files

Do not edit these directly:

```text
dist/
node_modules/
.npm-cache/
```

The build may regenerate `dist/`, but those files should not be manually changed.

## Development rules for AI agents

- Keep parser failures structured with line, column, token, context, and suggestion when possible.
- Any new syntax must update:
  - parser tests,
  - `docs/jabc-syntax.md`,
  - relevant exporter/playback/renderer docs,
  - README if user-facing.
- Any new AST field must update `docs/ast.md`.
- Keep `src/index.ts` as the public export surface.
- Keep renderers and converters pure where possible.
- Staff rendering must continue to go through `toStandardAbc`; do not make the staff renderer parse JABC itself.
- Playback scheduling must stay browser-independent; browser APIs belong in `web-audio-player.ts`.
- Prefer narrow, well-tested features over broad rewrites.

## Current known limitations

- Only major-key pitch semantics are fully implemented.
- Minor/pentatonic modes may be parsed but are not semantically mapped yet.
- General tuplets beyond `(3` are not implemented.
- Nested repeats and advanced repeat jumps such as D.C., D.S., Fine, and Coda are not implemented.
- Multi-voice MusicXML currently exports voices as separate parts; same-staff voice merging is not implemented.
- Slurs are exported and rendered, but playback does not yet apply legato shaping.
- Jianpu SVG rendering is preview-oriented, not publication-grade engraving.
- There is no JABC import from ABC or MusicXML yet.
- There is no OCR/image import.

## Recommended next task

Pick from `ROADMAP.md`. The jianpu layout refactor now has a dedicated pure layout module and direct unit coverage for source systems, automatic wrapping, readable narrow widths, and event positioning. The best next engineering task is usually one of:

1. Add import support from standard ABC to AST/JABC.
2. Add import support from MusicXML to AST/JABC.
3. Implement minor-key and pentatonic pitch semantics.
4. Improve same-measure multi-voice alignment, lyric spacing, and optional measure numbering.

Avoid starting with OCR, full publication engraving, or arbitrary MusicXML round-tripping until the AST and importer rules are better defined.

## Commit style

Use Conventional Commit style when possible:

```text
feat: add abc importer skeleton
fix: report invalid triplet tokens
chore: initialize repository metadata
docs: add ai handoff guide
```

## GitHub repository initialization

If the repository has not been initialized locally yet:

```bash
git init
git branch -M main
git remote add origin https://github.com/ChaoXianGaoGuan/jianpu-abc.git
git add .
git commit -m "chore: initialize JianpuABC project"
git push -u origin main
```

If the remote repository already contains commits:

```bash
git pull --rebase origin main --allow-unrelated-histories
git push -u origin main
```
