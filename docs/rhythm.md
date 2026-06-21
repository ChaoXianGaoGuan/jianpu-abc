# Rhythm and beat analysis

`src/core/rhythm.ts` provides browser-independent helpers for reasoning about time inside a `Measure`. `src/core/beat-clear.ts` builds on those helpers to derive a beat-clear `Score` for display. Neither module parses JABC text or renders SVG; both consume the same `Score` AST used by converters, playback, and renderers.

## Responsibilities

- Compute the expected duration of a measure from `M:`.
- Compute the beat duration from the meter denominator.
- Sum performed event durations, ignoring zero-duration inline key changes.
- Produce per-event time spans with start, duration, end, beat index, and beat-boundary flags.
- Detect whether a span hides a beat boundary through `hidesBeatBoundary`.
- Detect whether a measure is complete, underfull, or overfull.

## API

```ts
import { analyzeMeasureRhythm, eventTimeSpans } from "./src/core/rhythm";

const rhythm = analyzeMeasureRhythm(measure, score.header.meter);
const spans = eventTimeSpans(measure, rhythm.beatDuration);
```

`EventTimeSpan.crossesBeat` is intentionally about performed timing rather than visual source spelling. `hidesBeatBoundary(span)` is the shared policy used by Web warnings and beat-clear transformation: it returns true when a timed event crosses a beat and either its start or end is not on a beat boundary. For example, in `4/4`, an eighth note followed by a dotted quarter can be rhythmically valid while still hiding a beat boundary.

## Current limits

The rhythm module only reports timing facts. Web warning text is generated in `src/web/rhythm-warnings.ts`, which consumes this module and shows non-fatal tips in the workbench after successful parsing. Beat-clear display is produced by `src/core/beat-clear.ts`, which transforms hidden-beat notes and rests into ordinary split events before rendering.
