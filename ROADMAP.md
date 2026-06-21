# Roadmap

This roadmap helps maintainers and AI agents choose work in a safe order.
It is intentionally conservative: prioritize stable syntax, AST semantics, and tested conversions before advanced UI or OCR.

## Completed foundation

- TypeScript/Vite/Vitest project setup.
- Score AST and parser result/error model.
- JABC syntax for headers, notes, rests, extensions, accidentals, octaves, durations, dots, comments, lyrics, voices, barlines, repeats, endings, ties, slurs, and basic triplets.
- Score normalization with lyric attachment.
- Major-key pitch mapping.
- Standard ABC export.
- Native MusicXML 4.0 partwise export.
- Pure playback event scheduling.
- Web Audio playback controls.
- Sampled guitar and piano playback, synth selection, and synthesized fallback.
- SVG jianpu rendering.
- Jianpu duration grouping, graphical repeats/endings, SVG ties/slurs/tuplets, source-row preservation, and optional aligned measure columns.
- Staff rendering through abcjs.
- Inline key changes across parsing, export, playback, and rendering.
- Browser validation UI with notation switching, playback highlighting, instrument selection, and ABC/MusicXML copy and download actions.
- Repository-backed read-only JABC score library with search, categories, and dirty-editor protection.
- Documentation for syntax, AST, converters, playback, and renderers.
- AI handoff and design decision documentation.

## Short-term priorities

### 1. Jianpu layout engine refactor

Goal: separate jianpu layout calculation from SVG string rendering so future engraving fixes do not require editing one large renderer file.

Scope:

- Move system, row, measure, beat, event positioning, readable-width scaling, and measure-column alignment into `src/renderers/jianpu-layout.ts`.
- Keep `renderJianpu(score, options)` as the public API while internally using `Score AST -> JianpuLayout -> SVG`.
- Add layout-focused tests for explicit systems, automatic wrapping, expanded readable viewBox widths, and beat-level event placement.
- Keep the layout engine pure and browser-independent.

Follow-up slices:

- Extract duration-line grouping and barline clearance into a dedicated module.
- Add a core rhythm/beat analysis module for measure validation and beat-clear display.
- Split the Web workbench controllers after the rendering boundary is stable.

### 2. Standard ABC import

Goal: parse a useful subset of standard ABC into the existing `Score` AST.

Scope:

- Headers: `X:`, `T:`, `C:`, `M:`, `L:`, `Q:`, `K:`, `V:`, `w:`.
- Notes, rests, durations, dots, ties, slurs, triplets, barlines, repeats, and endings.
- Major-key pitch to jianpu degree conversion.
- Clear errors for unsupported constructs.

Non-goals for the first pass:

- Full ABC dialect compatibility.
- Chord symbols, decorations, grace notes, macros, transposition macros.
- Advanced `%%score` layout semantics.

Deliverables:

- `src/converters/from-abc.ts` or `src/importers/from-abc.ts`.
- Tests with round-trip examples.
- Documentation update.

### 3. MusicXML import

Goal: import a focused subset of MusicXML partwise documents into AST/JABC.

Scope:

- One or more parts.
- Pitches, rests, durations, dots, ties, slurs, tuplets, barlines, repeats, lyrics, tempo, key, meter.
- Convert supported pitches into jianpu degrees relative to a major tonic.

Non-goals for the first pass:

- Complete MusicXML round-trip fidelity.
- Layout, page formatting, beams, articulations, ornaments, part groups.
- OCR or PDF import.

Deliverables:

- Importer module and tests.
- Documentation for supported MusicXML subset.

### 4. Minor and pentatonic semantics

Goal: make parsed `K:A minor jianpu` and `K:G pentatonic jianpu` musically meaningful.

Scope:

- Define scale interval mappings.
- Update `degreeToPitch` and related tests.
- Decide how accidentals interact with non-major modes.
- Update ABC/MusicXML export expectations.

### 5. Remaining renderer quality improvements

Goal: improve readability without attempting full engraving.

Scope:

- Align multi-voice measures more clearly.
- Optional measure numbers.
- Better lyrics spacing.

### 6. Same-staff multi-voice semantics

Goal: represent multiple voices on the same staff in ABC/MusicXML/rendering when appropriate.

Scope:

- Add voice grouping metadata.
- Support `%%score`-like grouping in output.
- Decide whether JABC should have a first-class group syntax.

## Medium-term priorities

### General tuplets

Extend `(3` support to patterns such as `(2`, `(5`, or explicit ratio tuplets.

Requirements:

- AST should represent actual/normal ratios.
- Parser should give clear errors for incomplete tuplets.
- ABC/MusicXML/playback/rendering tests must be added.

### Advanced repeat flow

Support nested or more complex repeat structures.

Examples:

- Multiple endings beyond `[1` and `[2`.
- D.C. / D.S. / Fine / Coda.
- Repeat validation and error reporting.

### Better playback expression

Use existing AST marks to shape playback.

Ideas:

- Legato smoothing for slurs.
- Small articulation gaps outside slurs.
- Per-voice instruments.
- Velocity shaping.
- Loop and seek support.

### Project serialization

Add an explicit project JSON format around the AST.

Use cases:

- Save editor state.
- Store user preferences.
- Preserve non-syntactic UI metadata.

The built-in repository score library is complete, but it does not replace this
future editable project format or browser/cloud persistence.

## Long-term possibilities

These are useful, but they should not be first priorities:

- Publication-grade jianpu engraving.
- Full MusicXML round-tripping.
- OCR from scanned numbered notation.
- PDF export.
- Collaborative editing.
- Plugin system.
- NPM package publication.
- Browser-based full editor with project management.

## Explicit non-goals for now

Avoid these until core import/export semantics are stronger:

- Do not implement OCR first.
- Do not make the renderer parse JABC directly.
- Do not add a large UI framework unless the plain validation UI becomes a real blocker.
- Do not replace the AST boundary with text-to-text conversion.
- Do not rely solely on ABC as an intermediate for all features; MusicXML and playback need AST semantics.

## Definition of done for new features

A feature is not complete until it has:

- Parser or API implementation.
- Unit tests for success and failure cases.
- Documentation update.
- Export/playback/rendering behavior where relevant.
- `npm test`, `npm run typecheck`, and `npm run build` passing.
