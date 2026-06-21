# Rhythm and beat analysis

`src/core/rhythm.ts` provides browser-independent helpers for reasoning about time inside a `Measure`. It does not parse JABC text and does not render SVG; it consumes the same `Score` AST used by converters, playback, and renderers.

## Responsibilities

- Compute the expected duration of a measure from `M:`.
- Compute the beat duration from the meter denominator.
- Sum performed event durations, ignoring zero-duration inline key changes.
- Produce per-event time spans with start, duration, end, beat index, and beat-boundary flags.
- Detect whether a measure is complete, underfull, or overfull.

## API

```ts
import { analyzeMeasureRhythm, eventTimeSpans } from "./src/core/rhythm";

const rhythm = analyzeMeasureRhythm(measure, score.header.meter);
const spans = eventTimeSpans(measure, rhythm.beatDuration);
```

`EventTimeSpan.crossesBeat` is intentionally about performed timing rather than visual source spelling. For example, in `4/4`, an eighth note followed by a dotted quarter can be rhythmically valid while still crossing a beat boundary. Future renderer options such as beat-clear display can use this information to decide whether to keep the source spelling or show an explicit continuation mark.

## Current limits

The module only reports timing facts. Web warning text is generated in `src/web/rhythm-warnings.ts`, which consumes this module and shows non-fatal tips in the workbench after successful parsing. The project does not yet rewrite notation or decide whether a dotted value should be rendered as an extension; beat-clear display should build on this module instead of duplicating time arithmetic inside renderers or Web UI code.
