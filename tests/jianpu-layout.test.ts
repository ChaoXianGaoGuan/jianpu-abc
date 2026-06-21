import { describe, expect, it } from "vitest";
import type { Fraction, Measure } from "../src/core/ast";
import { parseJabc } from "../src/core/parser";
import {
  layoutMeasures,
  positionEvents,
} from "../src/renderers/jianpu-layout";

const QUARTER: Fraction = { numerator: 1, denominator: 4 };

function parseMeasures(source: string): Measure[] {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  const voice = result.value.voices[0];
  if (voice === undefined) throw new Error("Expected default voice");
  return voice.measures;
}

function buildLayout(measures: Measure[], options: {
  width?: number;
  alignMeasuresAcrossSystems?: boolean;
} = {}) {
  return layoutMeasures(
    measures,
    options.width ?? 420,
    32,
    80,
    100,
    32,
    QUARTER,
    options.alignMeasuresAcrossSystems ?? true,
    20,
  );
}

describe("jianpu layout", () => {
  it("keeps explicit source systems and aligns shared measure columns", () => {
    const measures = parseMeasures(`M:4/4
L:1/4
K:C jianpu
| 1 2 3 4 | 1/2 2/2 3 4 |
| 1 2 3 4 | 1 2 3/2 4/2 |`);

    const layout = buildLayout(measures, { alignMeasuresAcrossSystems: true });

    expect(layout).toHaveLength(4);
    expect(layout[0]?.y).toBe(layout[1]?.y);
    expect(layout[2]?.y).toBeGreaterThan(layout[0]?.y ?? 0);
    expect(layout[0]?.width).toBeCloseTo(layout[2]?.width ?? 0);
    expect(layout[1]?.width).toBeCloseTo(layout[3]?.width ?? 0);
  });

  it("fills the available width after aligning explicit measure columns", () => {
    const measures = parseMeasures(`M:4/4
L:1/4
K:C jianpu
| 1 2 3 1 | 1 2 3 1 |
| 3 4 5 - | 3 4 5 - |
| 5 6 5 4 | 3 1 - - |`);

    const layout = buildLayout(measures, { width: 620, alignMeasuresAcrossSystems: true });
    const expectedRightEdge = 620 - 32;

    expect(layout[1]!.x + layout[1]!.width).toBeCloseTo(expectedRightEdge, 5);
    expect(layout[3]!.x + layout[3]!.width).toBeCloseTo(expectedRightEdge, 5);
    expect(layout[5]!.x + layout[5]!.width).toBeCloseTo(expectedRightEdge, 5);
    expect(layout[0]!.x).toBe(layout[2]!.x);
    expect(layout[1]!.x).toBe(layout[3]!.x);
  });

  it("wraps measures automatically when no source system breaks are present", () => {
    const measures = parseMeasures(`M:4/4
L:1/4
K:C jianpu
| 1 2 3 4 | 1 2 3 4 | 1 2 3 4 | 1 2 3 4 |`);

    const layout = buildLayout(measures, { width: 320 });
    const rowYs = new Set(layout.map((placed) => placed.y));

    expect(layout).toHaveLength(4);
    expect(rowYs.size).toBeGreaterThan(1);
    expect(layout[0]?.x).toBe(32);
    expect(layout[1]?.y).toBeGreaterThan(layout[0]?.y ?? 0);
  });

  it("expands narrow unaligned rows instead of over-compressing dense measures", () => {
    const measures = parseMeasures(`M:4/4
L:1/4
K:C jianpu
| 1 2 3 4 5 6 7 1 2 3 4 5 |`);

    const layout = buildLayout(measures, {
      width: 320,
      alignMeasuresAcrossSystems: false,
    });
    const first = layout[0];
    if (first === undefined) throw new Error("Expected a measure layout");

    expect(first.width).toBeGreaterThan(320 - 32 * 2);
    expect(first.x + first.width).toBeGreaterThan(320);
  });

  it("places timed events by beat span while key changes share the next event time", () => {
    const measures = parseMeasures(`M:4/4
L:1/4
K:C jianpu
| 1/2 2/2 [K:G jianpu] 3 4 |`);
    const layout = buildLayout(measures);
    const first = layout[0];
    if (first === undefined) throw new Error("Expected a measure layout");

    const positioned = positionEvents(first, QUARTER, 32);

    expect(positioned).toHaveLength(5);
    expect(positioned[0]?.startTime).toEqual({ numerator: 0, denominator: 1 });
    expect(positioned[1]?.startTime).toEqual({ numerator: 1, denominator: 8 });
    expect(positioned[2]?.event.type).toBe("key-change");
    expect(positioned[2]?.slotCount).toBe(0);
    expect(positioned[2]?.startTime).toEqual({ numerator: 1, denominator: 4 });
    expect(positioned[3]?.startTime).toEqual({ numerator: 1, denominator: 4 });
    expect(positioned[0]?.centerX).toBeLessThan(positioned[1]?.centerX ?? 0);
    expect(positioned[1]?.centerX).toBeLessThan(positioned[3]?.centerX ?? 0);
    expect((positioned[3]?.centerX ?? 0) - (positioned[1]?.centerX ?? 0))
      .toBeGreaterThan((positioned[1]?.centerX ?? 0) - (positioned[0]?.centerX ?? 0));
  });
});
