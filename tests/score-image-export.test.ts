import { describe, expect, it } from "vitest";
import {
  composeSvgFragments,
  rasterSize,
  scoreImageFilename,
} from "../src/web/score-image-export";

describe("score image export", () => {
  it("stacks staff systems into one SVG in source order", () => {
    const result = composeSvgFragments([
      { markup: '<svg viewBox="0 0 600 100"><text>first</text></svg>', width: 600, height: 100 },
      { markup: '<svg viewBox="0 0 580 120"><text>second</text></svg>', width: 580, height: 120 },
    ]);

    expect(result.width).toBe(600);
    expect(result.height).toBe(232);
    expect(result.markup).toContain('<svg x="0" y="0" width="600" height="100"');
    expect(result.markup).toContain('<svg x="0" y="112" width="580" height="120"');
    expect(result.markup.indexOf("first")).toBeLessThan(result.markup.indexOf("second"));
  });

  it("uses 2x PNG output while respecting dimension and pixel limits", () => {
    expect(rasterSize(800, 600)).toEqual({ width: 1600, height: 1200, scale: 2 });
    const limited = rasterSize(20_000, 10_000);
    expect(limited.width).toBeLessThanOrEqual(16384);
    expect(limited.width * limited.height).toBeLessThanOrEqual(32_000_000);
  });

  it("creates safe notation-specific filenames", () => {
    expect(scoreImageFilename("一千年 以后", "jianpu", "svg"))
      .toBe("一千年-以后-jianpu.svg");
    expect(scoreImageFilename("A/B", "staff", "png")).toBe("A-B-staff.png");
    expect(scoreImageFilename(" ", "staff", "svg")).toBe("score-staff.svg");
  });
});
