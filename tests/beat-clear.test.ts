import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import { toBeatClearScore } from "../src/core/beat-clear";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

function firstMeasureEvents(source: string) {
  const score = parse(source);
  return toBeatClearScore(score).voices[0]!.measures[0]!.events;
}

describe("toBeatClearScore", () => {
  it("splits hidden-beat notes into tied ordinary events", () => {
    const events = firstMeasureEvents("M:4/4\nL:1/4\nK:C jianpu\n| 6e 1. 2 3 |");

    expect(events.map((event) => event.type)).toEqual(["note", "note", "note", "note", "note"]);
    expect(events[1]).toMatchObject({ type: "note", degree: 1, tieStart: true, duration: { numerator: 1, denominator: 8 } });
    expect(events[2]).toMatchObject({ type: "note", degree: 1, tieEnd: true, duration: { numerator: 1, denominator: 4 } });
  });

  it("splits dotted notes that start on a beat but end off beat", () => {
    const events = firstMeasureEvents("M:4/4\nL:1/4\nK:C jianpu\n| 2'. 3's 2's |");

    expect(events[0]).toMatchObject({ type: "note", degree: 2, octaveShift: 1, tieStart: true, duration: { numerator: 1, denominator: 4 } });
    expect(events[1]).toMatchObject({ type: "note", degree: 2, octaveShift: 1, tieEnd: true, duration: { numerator: 1, denominator: 8 } });
  });

  it("splits hidden-beat rests without ties", () => {
    const events = firstMeasureEvents("M:4/4\nL:1/4\nK:C jianpu\n| 1e 0. 2 3 |");

    expect(events[1]).toMatchObject({ type: "rest", duration: { numerator: 1, denominator: 8 } });
    expect(events[2]).toMatchObject({ type: "rest", duration: { numerator: 1, denominator: 4 } });
    expect("tieStart" in events[1]!).toBe(false);
    expect("tieEnd" in events[2]!).toBe(false);
  });

  it("preserves incoming and outgoing ties across split notes", () => {
    const events = firstMeasureEvents("M:4/4\nL:1/4\nK:C jianpu\n| 0e 1e~ ~1. 0 |");

    expect(events[1]).toMatchObject({ type: "note", degree: 1, tieStart: true });
    expect(events[2]).toMatchObject({ type: "note", degree: 1, tieEnd: true, tieStart: true, duration: { numerator: 1, denominator: 4 } });
    expect(events[3]).toMatchObject({ type: "note", degree: 1, tieEnd: true, duration: { numerator: 1, denominator: 8 } });
  });
});
