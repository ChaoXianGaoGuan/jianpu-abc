# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses semantic versioning.

## [Unreleased]

### Changed

- Anchor repeat navigation markers directly to same-row jianpu barline boundaries, including Coda markers at the start of the following measure, bring them closer to the barline, enlarge Coda, and give the current-measure preview more vertical room.
- Make the Web current-measure preview a compact inline strip that fills the preview slot more effectively.
- Clarify Web playback-start behavior so only left-clicked jianpu events set the persistent start anchor, while source navigation remains separate.
- Split the Web UI into a focused workbench view and a separate score-library view with top navigation.
- Update AI handoff and roadmap status for the completed jianpu layout extraction and current validation counts.
- Route beat-clear display through a core Score transform instead of renderer-only visual fragments.
- Retire renderer-only beat-clear visual fragments after moving display rewriting to the core transform.
- Shared hidden beat-boundary detection between rhythm warnings and beat-clear transformation.
- Added a pure rhythm analysis module for measure duration, beat positions, and cross-beat event spans.
- Continued the jianpu renderer refactor by moving short-note duration-line grouping into its own module.
- Began the jianpu renderer refactor by introducing a pure layout module for measure and event positioning.

### Fixed

- Expand aligned jianpu measure columns to fill complete fixed-count rows instead of leaving unused space when one or two measures per row are selected.
- Scope current-measure preview SVG styles so they do not change the main jianpu preview font size.
- Keep jianpu duration underlines joined across inline key changes within the same beat.
- Detect cross-beat dotted notes that start on a beat but end off the next beat in rhythm tips and beat-clear display.
- Clear the jianpu editor-caret highlight when the JABC textarea loses focus, and restore it when editing resumes.
- Preserve the cross-bar tie into the first ending in 《一千年以后》 and cover ties that leave a triplet at an ending boundary.
- Fill automatically wrapped jianpu rows to the final readable viewBox width when measure column alignment is disabled.
- Enlarge jianpu header text and separate key, meter, and tempo metadata fields.
- Fill unaligned jianpu source rows naturally, align shared underline layer edges, and keep underline groups clear of shared repeat-start boundaries.
- Beam mixed short-note staff groups within each beat by removing ABC spaces between adjacent beaming candidates.
- Keep short-note jianpu underline groups clear at beat boundaries and before right barlines.
- Preserve readable jianpu spacing on narrow previews by scaling a wider SVG viewBox instead of over-compressing notes.
- Keep aligned jianpu measure columns consistent when narrow-screen readable widths expand individual measures.
- Keep duration dots close to jianpu note numbers while preserving dotted-rhythm spacing.
- Add explicit spacing between complete jianpu beats while keeping duration lines grouped within each beat.
- Remove redundant standard ABC barlines before same-system repeat/start marks so abcjs renders one shared staff boundary.
- Space jianpu events proportionally to their performed durations, expand beats for readable short-note spacing, and place accidentals closer to the upper-left of note numbers.
- Suppress redundant same-row single barlines and align following repeat/start marks to the shared measure boundary.
- Enlarge jianpu accidentals and render double-sharp/double-flat as standard `𝄪` / `𝄫` glyphs.
- Align jianpu measure columns across explicit source rows by default, with an API option and Web UI checkbox to restore per-row natural spacing.
- Update Web playback highlighting to toggle existing jianpu SVG event classes instead of redrawing the full score for every note.
- Connect mixed eighth/sixteenth jianpu underlines by shared line level within each beat, including short rests.
- Refine jianpu relation curves: mask same-row tie crossings at barlines, open a clean center gap for tuplet numbers, and keep slurs clear of octave dots.
- Draw jianpu repeats, final barlines, and numbered endings with proper SVG lines, dots, and brackets.
- Preserve JABC music-row breaks through ABC, MusicXML, jianpu, and staff rendering.
- Center and enlarge jianpu duration dots relative to the note number.
- Render long jianpu durations as beat-sized extension dashes instead of multiplier labels.
- Connect equal short-duration lines within beats and draw slurs, ties, and tuplets as SVG curves.
- Preserve ABC beaming groups and wrap abcjs staff output across readable systems.

### Added

- Add an optional one-measure, meter-aware metronome count-in for full-score Web playback and a reusable `prependCountIn()` playback-plan helper.
- Add zero-duration repeat navigation markers for Segno, Coda, Fine, D.C., D.S., Da Capo, and Da Coda in parsing, jianpu rendering, ABC export, and D.C./D.S. playback expansion.
- Add a Web current-measure jianpu preview that follows the editor caret.
- Add selectable playback start points in the jianpu preview plus a "play from current position" Web control.
- Add a Web guide view with JABC syntax quick reference cards and loadable examples.
- Add direct unit coverage for the pure jianpu layout module across explicit systems, automatic wrapping, narrow readable widths, and event positioning.
- Add optional beat-clear jianpu visual rewrites for notes and rests that hide beat boundaries.
- Show non-fatal Web workbench rhythm tips for incomplete measures and cross-beat dotted spans.
- Bidirectional JABC/jianpu source navigation with editor-caret highlighting and right-click token selection, plus SVG/PNG downloads for current jianpu and staff previews.
- Score-driven metronome playback with compound-meter accents, manual meter/tempo fallbacks, and independent live instrument/metronome volume controls.
- Add 林俊杰《一千年以后》 to the built-in JABC score library.
- Repository-backed JABC score library with build-time discovery, search, category filtering, editor loading, and unsaved-change protection.
- Absolute duration letter suffixes `w`, `h`, `q`, `e`, and `s` for more compact JABC note and rest durations.
- Guitar-first playback defaults, delayed scheduling until audio readiness, single-view notation preview switching, and copy/download-only ABC/MusicXML exports in the Web UI.
- Inline JABC key changes such as `[K:G jianpu]` across parsing, ABC/MusicXML export, playback, and jianpu rendering.
- Web Audio instrument presets and UI selection for synth plus sampled piano and guitar playback with synthesized fallback.
- Degree-to-pitch mapping for note names, MIDI, ABC, and MusicXML pitch objects.
- Standard ABC export for headers, major-key notes, rests, relative durations, extensions, and lyrics.
- Golden ABC fixtures and C, D, F key mapping tests for Milestone 2.
- Standard ABC export documentation.
- Pure playback event scheduling with tempo, rests, extensions, ties, and source event IDs.
- Browser `WebAudioPlayer` with play, pause, resume, stop, disposal, and highlight callbacks.
- Playback timing, tie validation, MIDI frequency, and mocked Web Audio tests for Milestone 3.
- Playback architecture and API documentation.
- Vite validation UI with live JABC parsing, standard ABC output, playback controls, and actionable parser errors.
- JABC parser support for octave suffixes, single/double accidentals, natural signs, duration divisors/multipliers, and one or two dots.
- Combined modifier parsing such as `#4'/2.` with ABC export, playback, validation, and UI coverage.
- Pure SVG jianpu renderer for metadata, notes, accidentals, octaves, durations, rests, extensions, lyrics, and measure wrapping.
- Shared renderer/playback event IDs with live note highlighting in the validation UI.
- SVG rendering tests for notation content, XML escaping, lyric visibility, wrapping, and highlights.
- abcjs 6.6.3 staff renderer adapter driven exclusively by standard ABC from the Score AST.
- Responsive staff preview synchronized with JABC editing, jianpu preview, playback, and ABC output.
- Mock-engine tests for staff ABC conversion and abcjs visual option mapping.
- Native MusicXML 4.0 partwise export for metadata, attributes, tempo, notes, rests, durations, accidentals, dots, extensions, and basic lyrics.
- MusicXML exporter tests for metadata, key signatures, altered pitches, rests, durations, escaping, and error cases.
- Web validation UI MusicXML output with copy and download actions for ABC and MusicXML.
- MusicXML export documentation.
- JABC `V:` and inline `[V:...]` parsing with per-voice measures and lyrics.
- Multi-voice ABC export using `V:` definitions and body sections.
- Multi-voice MusicXML export as separate parts.
- Parallel multi-voice playback scheduling and stacked SVG jianpu voice rendering.
- Multi-voice parser, ABC, MusicXML, playback, and renderer tests.
- Parser support for `||`, `|]`, `[|`, `|:`, `:|`, and `[1` / `[2` ending markers.
- ABC, MusicXML, and SVG output for complex barlines, repeats, and endings.
- Repeat/barline documentation and regression tests.
- Playback expansion for simple repeats and first/second endings, with measure-order tests.
- JABC tie marker parsing (`1~` and `~1`) with ABC, MusicXML, SVG, and playback coverage.
- Basic `(3` triplet parsing with playback timing, ABC export, MusicXML export, SVG rendering, and regression tests.
- Slur parsing with ABC export, MusicXML export, SVG rendering, and regression tests.
- Project handoff documentation: `AI_HANDOFF.md`, `ROADMAP.md`, `DECISIONS.md`, and `LICENSE`.

## [0.1.0] - 2026-06-19

### Added

- Strict TypeScript project configuration and Vitest test setup.
- Serializable `Score` AST, fraction helpers, and source locations.
- JABC parser for core headers, degrees `1`–`7`, rests, extensions, single barlines, lyrics, and comments.
- Structured parse errors with line, column, context, token, and repair suggestion.
- Basic lyric normalization that skips rests and extensions.
- Repository README, contributor guide, syntax specification, and AST documentation.
