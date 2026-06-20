# JianpuABC

JianpuABC is an ABC-style toolkit for numbered musical notation. Its source text
format is JABC (Jianpu ABC), an ABC-compatible jianpu dialect.

Try the validation UI at
[https://chaoxiangaoguan.github.io/jianpu-abc/](https://chaoxiangaoguan.github.io/jianpu-abc/).

This repository currently implements Milestones 1 through 6: a
browser-independent TypeScript AST and parser, normalization, pitch mapping,
standard ABC export, native MusicXML export, playback event scheduling, Web
Audio playback, and SVG jianpu/staff rendering.

## Documentation

- [JABC syntax specification](docs/jabc-syntax.md)
- [Score AST design](docs/ast.md)
- [Standard ABC export](docs/abc-export.md)
- [MusicXML export](docs/musicxml-export.md)
- [Playback and Web Audio](docs/playback.md)
- [SVG jianpu renderer](docs/jianpu-renderer.md)
- [Staff renderer adapter](docs/staff-renderer.md)
- [GitHub Pages deployment](docs/deployment.md)
- [Built-in score library](docs/score-library.md)
- [AI handoff guide](AI_HANDOFF.md)
- [Roadmap](ROADMAP.md)
- [Design decisions](DECISIONS.md)
- [Contributor guidelines](AGENTS.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)

## Setup

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

After `npm run dev`, open `http://127.0.0.1:5173`. The validation UI includes
the repository's built-in JABC score library with search and category filters,
live JABC parsing, single-view jianpu/staff preview switching, ABC/MusicXML
copy/download actions, playback event counts, guitar-first instrument selection,
score-driven metronome and tempo controls, independent live volume sliders, and
Web Audio play/pause/resume/stop controls. Use `npm run dev -- --port 4173`
to select a different port.

Add a score to `src/library/<category>/<slug>.jabc`, then commit and push it to
publish the score with the next GitHub Pages deployment. The browser library is
read-only and never requests GitHub credentials.

## Supported syntax

The current parser supports these header fields:

- `X:` tune index
- `T:` title
- `C:` composer or source
- `M:` meter such as `4/4`
- `L:` default note length such as `1/4`
- `Q:` tempo such as `1/4=120`
- `K:` jianpu tonic such as `K:C jianpu`; inline key changes such as `[K:G jianpu]` are also supported in music lines
- `V:` voice switch such as `V:melody`; inline `[V:melody]` is also supported
- `w:` whitespace-separated lyrics for the current voice

Music tokens support degrees `1` through `7`, rests `0` and `z`, extension `-`,
single and compound barlines (`|`, `||`, `|]`, `[|`, `|:`, `:|`), and endings
such as `[1` / `[2`. Notes additionally support accidentals (`#4`, `b7`,
`=3`, double accidentals), octave suffixes (`1'`, `1,`), duration suffixes
(`1e`, `1s`, `1/2`, `1*2`), up to two dots, and tie markers (`1~` starts a tie, `~1` stops
a tie), slur markers like `(1 2 3)`, and triplets with `(3`. Modifiers compose as `#4'/2.`. Full-line
and inline `%` comments are ignored. Unknown uppercase header fields are retained in
`header.extraFields` so later milestones can add semantics without losing data.

```abc
X:1
T:两只老虎
M:4/4
L:1/4
Q:1/4=120
K:C jianpu
| 1 2 3 1 | 1 2 3 1 |
| 3 4 5 - | 3 4 5 - |
w: 两 只 老 虎 两 只 老 虎
```

## Parser API

```ts
import { parseJabc } from "./src/index";

const result = parseJabc(source);
if (result.success) {
  console.log(result.value);
} else {
  console.error(result.errors);
}
```

The parser returns a discriminated result instead of throwing for input
errors. Each error includes its line, column, nearby source text, offending
token when available, and a repair suggestion.

## Standard ABC export

```ts
import { parseJabc, toStandardAbc } from "./src/index";

const result = parseJabc(source);
if (result.success) {
  const abc = toStandardAbc(result.value);
}
```

The exporter preserves the core headers and per-voice lyrics, maps degrees
through the current JABC tonic, emits inline ABC key changes for `[K:...]`,
converts rests to `z`, encodes relative durations, merges `-` extensions into
the preceding note, and emits `V:` sections for multi-voice scores. It currently
supports the major-key subset; see the export documentation for error behavior
and current limits.

## Current normalization rules

- A leading barline does not create an empty measure.
- A closing `|` is stored as `Measure.barline`.
- Notes, rests, and extensions initially receive the current `L:` duration.
- The first `w:` line is attached to notes in sequence; rests and extensions
  do not consume lyric syllables.
- Extensions remain explicit AST events. Duration resolution belongs to a
  later milestone.

## MusicXML export

```ts
import { parseJabc, toMusicXml } from "./src/index";

const result = parseJabc(source);
if (result.success) {
  const xml = toMusicXml(result.value);
}
```

The native exporter writes a MusicXML 4.0 `score-partwise` document with title,
composer, divisions, major-key fifths, inline key changes, time signature,
tempo, notes, rests, durations, accidentals, dots, and basic lyrics. Multiple
JABC voices are exported as separate MusicXML parts. It currently supports the
same major-key subset as the ABC exporter.

## Playback

```ts
import { scoreToPlaybackPlan, WebAudioPlayer } from "./src/index";

const plan = scoreToPlaybackPlan(score);
const player = new WebAudioPlayer(undefined, { instrument: "guitar" }); // Create from a user interaction in browsers.
player.play(plan.events, {
  metronomeEvents: plan.metronomeEvents,
  totalDuration: plan.duration,
});
```

The pure scheduler handles tempo, rests, extensions, inline key changes, parsed
ties, triplet timing, simple repeat expansion, first/second endings, and parallel multi-voice timelines. The browser
player defaults to sampled `guitar`, also provides sampled `piano` and `synth`,
waits for audio readiness before scheduling highlights, and supports `play`,
`pause`, `resume`, `stop`, and `dispose`; callbacks expose the active source
event for score highlighting.

## Jianpu rendering

```ts
import { renderJianpu } from "./src/index";

const svg = renderJianpu(score, {
  width: 900,
  alignMeasuresAcrossSystems: true,
});
```

The pure renderer outputs an SVG string with metadata, numbered notes,
inline key-change markers, larger accidentals, standard double-sharp/double-flat
glyphs, octave and duration marks, rests, extensions, lyrics, aligned source-row
measure columns, measure wrapping, readable narrow-screen spacing with responsive SVG scaling when needed, short-note underline gaps at beat and barline boundaries, multi-voice labels, and optional event highlighting. The
validation UI shows jianpu by default, can switch the same preview area to
staff notation, includes a checkbox for toggling aligned jianpu measure columns,
and follows playback through matching source event IDs by toggling existing SVG
highlight classes instead of redrawing the whole score on every note.

## Staff rendering

```ts
import { renderStaffAsync } from "./src/index";

await renderStaffAsync(document.querySelector("#staff")!, score);
```

The staff adapter converts the AST through `toStandardAbc`, then uses abcjs to
render responsive staff notation. The web UI refreshes the selected notation
preview, playback, and export actions from the same parsed score.

The JABC text parser accepts basic triplets and slurs, but does not yet accept
general tuplet ratios beyond `(3`. Repeats and endings are preserved in ABC,
MusicXML, and SVG output, and playback expands simple repeat structures with
first/second endings. Complex MusicXML features such as advanced tuplets,
same-staff voice merging, and `jianpu` clef remain outside the completed
milestones.
