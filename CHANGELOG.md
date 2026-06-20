# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses semantic versioning.

## [Unreleased]

### Fixed

- Enlarge jianpu accidentals and render double-sharp/double-flat as standard `𝄪` / `𝄫` glyphs.
- Align jianpu measure columns across explicit source rows by default, with an API option and Web UI checkbox to restore per-row natural spacing.
- Refine jianpu relation curves: mask same-row tie crossings at barlines, open a clean center gap for tuplet numbers, and keep slurs clear of octave dots.
- Draw jianpu repeats, final barlines, and numbered endings with proper SVG lines, dots, and brackets.
- Preserve JABC music-row breaks through ABC, MusicXML, jianpu, and staff rendering.
- Center and enlarge jianpu duration dots relative to the note number.
- Render long jianpu durations as beat-sized extension dashes instead of multiplier labels.
- Connect equal short-duration lines within beats and draw slurs, ties, and tuplets as SVG curves.
- Preserve ABC beaming groups and wrap abcjs staff output across readable systems.

### Added

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
