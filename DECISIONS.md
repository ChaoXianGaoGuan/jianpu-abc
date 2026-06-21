# Design Decisions

This file records important project decisions so future maintainers and AI agents understand why the code is shaped this way.

## 1. Project name and format name

Decision:

- Project/product name: **JianpuABC**.
- Repository/package name: `jianpu-abc`.
- Text format name: **JABC**.

Reason:

`JianpuABC` is descriptive for users and discoverable on GitHub. `JABC` is compact and useful as the format/dialect name.

## 2. AST is the central boundary

Decision:

All downstream behavior must consume `Score` AST rather than raw JABC source.

Pipeline:

```text
JABC source -> parser -> Score AST -> converters/renderers/playback
```

Reason:

This keeps parsing, validation, conversion, rendering, and playback separate. It also makes future ABC/MusicXML import possible because importers can target the same AST.

Consequences:

- Converters should not inspect raw text.
- Renderers should not parse JABC.
- Playback should not depend on browser APIs.
- New syntax must be represented in AST before exporters or renderers rely on it.

## 3. JABC keeps ABC-like headers

Decision:

JABC uses ABC-style headers such as `X:`, `T:`, `M:`, `L:`, `Q:`, `K:`, `V:`, and `w:`.

Reason:

ABC headers are familiar, compact, and map well to existing notation concepts. Keeping them makes standard ABC export easier and makes the format approachable.

## 4. `K:C jianpu` identifies numbered notation semantics

Decision:

JABC key syntax requires a tonic plus the word `jianpu`, such as:

```abc
K:C jianpu
K:D jianpu
K:A minor jianpu
```

Reason:

Plain ABC `K:C` already has standard staff-note semantics. The suffix `jianpu` makes it explicit that body notes `1` through `7` are scale degrees, not standard ABC duration numbers.

## 5. Major mode is the first fully implemented pitch model

Decision:

Major-key pitch mapping is implemented first. Minor and pentatonic modes may be parsed but are not fully interpreted yet.

Reason:

Major mode covers the most common beginner and folk-song examples and gives a stable pitch model for ABC, MusicXML, and playback.

Future work:

- Define minor scale degree semantics.
- Define pentatonic scale degree semantics.
- Add explicit tests for mode-specific accidentals.

## 6. Ties use `1~` and `~1`

Decision:

JABC uses:

```abc
1~   tie start
~1   tie end
```

Reason:

The dash `-` is already used by numbered notation as an extension mark. Reusing `-` for ABC-style ties would be ambiguous. The `~` marker is compact, easy to parse, and visually distinct.

Export behavior:

- ABC: exported as standard ABC tie syntax such as `C- C`.
- MusicXML: exported as `<tie>` and `<tied>` elements.
- Playback: tied notes with the same pitch merge into one note event.

## 7. Slurs use note-local parentheses

Decision:

JABC slurs use note-local markers:

```abc
(1 2 3)
```

This parses as:

- `slurStart` on `1`.
- `slurEnd` on `3`.

Reason:

This resembles common text notation and ABC slur notation while staying easy to tokenize. Slurs are expressive marks and do not change duration.

Export behavior:

- ABC: `(C D E)`.
- MusicXML: `<slur type="start" />` and `<slur type="stop" />`.
- Playback: currently unchanged; future playback can use slurs for legato shaping.

## 8. Triplets use `(3`

Decision:

The first supported tuplet is the common triplet marker:

```abc
(3 1 2 3
```

It applies to the next three notes or rests with a 3-in-the-time-of-2 ratio.

Reason:

Triplets are common enough to need early support, while general tuplets require more design. Starting with `(3` keeps the parser and AST simple.

Future work:

- Generalize to `(2`, `(5`, explicit ratios, and incomplete-tuplet error reporting.

## 9. Extensions stay explicit in AST

Decision:

The extension mark `-` remains an `ExtensionEvent` instead of being immediately merged into the previous note during parsing.

Reason:

In jianpu, extension marks are visible notation. Keeping them explicit allows renderers to display the source faithfully while converters/playback can resolve them as needed.

## 10. MusicXML exporter is native

Decision:

The project has a native MusicXML exporter instead of relying only on ABC-to-MusicXML conversion.

Reason:

MusicXML needs semantic details that may not survive a text-to-text ABC path. A native exporter makes it easier to represent lyrics, ties, slurs, tuplets, repeats, and future jianpu-specific metadata.

## 11. Staff rendering goes through ABC

Decision:

The staff renderer converts AST to standard ABC using `toStandardAbc`, then passes that ABC to abcjs.

Reason:

abcjs is already good at staff rendering. This keeps staff rendering simple and ensures that ABC export and staff preview share the same semantics.

Consequence:

Do not make the staff renderer parse JABC directly.

## 12. SVG jianpu renderer is pure and preview-oriented

Decision:

The jianpu renderer returns an SVG string from a `Score` AST and does not use browser state.

Reason:

A pure renderer is easy to test and can run outside the browser. The current goal is clear validation and preview, not publication-grade engraving.

Future work:

- Replace text slur/tie marks with proper SVG paths.
- Improve spacing and multi-voice alignment.
- Add optional measure numbers and engraving controls.

## 13. Jianpu rendering is layout-first

Decision:

Jianpu rendering should follow this internal pipeline:

```text
Score AST -> JianpuLayout -> SVG
```

The layout step owns system grouping, measure widths, beat/event positions, readable-width expansion, and measure-column alignment. The SVG step consumes the layout and draws header text, events, duration lines, relation arcs, lyrics, and barlines.

Reason:

Recent fixes around row justification, duration-line clearance, header sizing, and beat grouping show that layout rules need a first-class model. Keeping layout separate from SVG string construction makes engraving changes safer and makes future beat-clear rhythm display possible without parsing source text in the renderer.

Consequences:

- Layout code belongs in `src/renderers/jianpu-layout.ts` and must remain pure/browser-independent.
- `renderJianpu(score, options)` remains the public API.
- New renderer behavior should prefer layout-level tests before SVG string assertions.
- Web UI controls should pass rendering options into the public API rather than inspecting or mutating layout internals.

## 14. Playback scheduling is pure

Decision:

`scoreToPlaybackEvents` returns browser-independent playback events. Web Audio scheduling is handled separately.

Reason:

Pure scheduling is easy to test and can later power multiple playback backends.

Consequences:

- No DOM or Web Audio APIs in pure scheduling.
- Web Audio code belongs in `src/playback/web-audio-player.ts`.

## 15. Multi-voice is supported but intentionally simple

Decision:

JABC supports multiple voices with `V:` and `[V:...]`. MusicXML currently exports each voice as a separate part.

Reason:

This gives useful behavior without prematurely designing full staff grouping.

Future work:

- Add same-staff voice grouping.
- Add `%%score`-style semantics or a JABC-native grouping syntax.

## 16. Avoid OCR and full engraving until import/export stabilizes

Decision:

OCR, scanned score import, and publication-grade engraving are long-term features, not near-term priorities.

Reason:

They are large projects on their own. The core format, AST, import/export, and playback semantics should stabilize first.

## 17. Tests define compatibility

Decision:

Every syntax or semantic change must include tests.

Required tests by feature type:

- Parser syntax: parser tests with AST assertions.
- Export behavior: ABC and/or MusicXML tests.
- Playback behavior: playback event tests.
- Rendering behavior: SVG string tests.
- Error behavior: structured parse/export/playback errors where applicable.

## 18. Documentation is part of the feature

Decision:

A feature is incomplete until documentation is updated.

Update targets:

- `README.md` for user-facing capabilities.
- `docs/jabc-syntax.md` for language changes.
- `docs/ast.md` for AST changes.
- Module docs for converters/playback/renderers.
- `CHANGELOG.md` for notable changes.
- `AI_HANDOFF.md` or `ROADMAP.md` if priorities or handoff status change.
