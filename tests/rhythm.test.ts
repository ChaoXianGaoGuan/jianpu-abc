import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import {
  analyzeMeasureRhythm,
  beatDurationForMeter,
  eventTimeSpans,
  measureDuration,
} from "../src/core/rhythm";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe("rhythm analysis", () => {
  it("computes measure duration and completion against the meter", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1 2 3 4 |");
    const measure = score.voices[0]!.measures[0]!;
    const rhythm = analyzeMeasureRhythm(measure, score.header.meter);

    expect(rhythm.actualDuration).toEqual({ numerator: 1, denominator: 1 });
    expect(rhythm.expectedDuration).toEqual({ numerator: 1, denominator: 1 });
    expect(rhythm.beatDuration).toEqual({ numerator: 1, denominator: 4 });
    expect(rhythm.isComplete).toBe(true);
    expect(rhythm.isUnderfull).toBe(false);
    expect(rhythm.isOverfull).toBe(false);
  });

  it("tracks beat position and cross-beat spans for dotted rhythms", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 6e 1. 2 3 |");
    const measure = score.voices[0]!.measures[0]!;
    const spans = eventTimeSpans(measure, beatDurationForMeter(score.header.meter));

    expect(measureDuration(measure)).toEqual({ numerator: 1, denominator: 1 });
    expect(spans.map((span) => span.start)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 8 },
      { numerator: 1, denominator: 2 },
      { numerator: 3, denominator: 4 },
    ]);
    expect(spans[0]).toMatchObject({ beatIndex: 0, startsOnBeat: true, crossesBeat: false });
    expect(spans[1]).toMatchObject({ beatIndex: 0, startsOnBeat: false, crossesBeat: true });
  });

  it("treats inline key changes as zero-duration rhythm events", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1 [K:G jianpu] 1 2 3 |");
    const measure = score.voices[0]!.measures[0]!;
    const spans = eventTimeSpans(measure, beatDurationForMeter(score.header.meter));

    expect(spans[1]!.event.type).toBe("key-change");
    expect(spans[1]!.duration).toEqual({ numerator: 0, denominator: 1 });
    expect(spans[1]!.start).toEqual(spans[1]!.end);
    expect(measureDuration(measure)).toEqual({ numerator: 1, denominator: 1 });
  });

  it("detects underfull and overfull measures", () => {
    const underfull = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1 2 |");
    const overfull = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1 2 3 4 5 |");

    expect(analyzeMeasureRhythm(underfull.voices[0]!.measures[0]!, underfull.header.meter)).toMatchObject({
      isComplete: false,
      isUnderfull: true,
      isOverfull: false,
    });
    expect(analyzeMeasureRhythm(overfull.voices[0]!.measures[0]!, overfull.header.meter)).toMatchObject({
      isComplete: false,
      isUnderfull: false,
      isOverfull: true,
    });
  });
});
