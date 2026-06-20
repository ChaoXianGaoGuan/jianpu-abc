import { describe, expect, it, vi } from "vitest";
import type { AbcVisualParams, Selector, TuneObjectArray } from "abcjs";
import { parseJabc } from "../src/core/parser";
import type { StaffRendererEngine } from "../src/renderers/staff-renderer";
import {
  loadStaffRendererEngine,
  renderStaff,
  toStaffAbc,
} from "../src/renderers/staff-renderer";

const RENDER_RESULT = [{}] as unknown as TuneObjectArray;

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe("staff renderer adapter", () => {
  it("uses the standard ABC exporter as its only score input", () => {
    const score = parse("T:五线谱测试\nM:4/4\nL:1/4\nK:D jianpu\n| 1 2 3 4 | 5 6 7 1' |");

    expect(toStaffAbc(score)).toBe(
      "X:1\nT:五线谱测试\nM:4/4\nL:1/4\nK:D\n| D E F G | A B c d |\n",
    );
  });

  it("passes ABC and visual options to the injected renderer engine", () => {
    const score = parse("K:C jianpu\n| 1 2 3 4 |");
    const target = {} as Element;
    const renderAbc = vi.fn((
      _target: Selector,
      _abc: string,
      _params?: AbcVisualParams,
    ) => RENDER_RESULT);
    const engine: StaffRendererEngine = { renderAbc };

    expect(renderStaff(target, score, {
      responsive: true,
      scale: 0.9,
      staffWidth: 760,
    }, engine)).toBe(RENDER_RESULT);
    expect(renderAbc).toHaveBeenCalledWith(
      target,
      "X:1\nL:1/4\nK:C\n| C D E F |\n",
      {
        add_classes: true,
        oneSvgPerLine: true,
        responsive: "resize",
        scale: 0.9,
        staffwidth: 760,
        wrap: {
          preferredMeasuresPerLine: 4,
          minSpacing: 1.65,
          maxSpacing: 2.6,
          lastLineLimit: 1.4,
          minSpacingLimit: 1.35,
        },
      },
    );
  });

  it("can disable abcjs responsive resizing", () => {
    const score = parse("K:C jianpu\n| 1 |");
    const renderAbc = vi.fn((
      _target: Selector,
      _abc: string,
      _params?: AbcVisualParams,
    ) => RENDER_RESULT);

    renderStaff({} as Element, score, { responsive: false }, { renderAbc });

    expect(renderAbc.mock.calls[0]?.[2]).not.toHaveProperty("responsive");
  });

  it("keeps explicit source systems instead of applying automatic wrapping", () => {
    const score = parse("K:C jianpu\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |");
    const renderAbc = vi.fn((
      _target: Selector,
      _abc: string,
      _params?: AbcVisualParams,
    ) => RENDER_RESULT);

    renderStaff({} as Element, score, {}, { renderAbc });

    expect(renderAbc.mock.calls[0]?.[1]).toContain("| C | D |\n| E | F |\n| G | A |");
    expect(renderAbc.mock.calls[0]?.[2]).not.toHaveProperty("wrap");
  });

  it("passes a single shared repeat boundary to abcjs", () => {
    const score = parse("K:C jianpu\n| 1 |: 7 |");
    const renderAbc = vi.fn((
      _target: Selector,
      _abc: string,
      _params?: AbcVisualParams,
    ) => RENDER_RESULT);

    renderStaff({} as Element, score, {}, { renderAbc });

    expect(renderAbc.mock.calls[0]?.[1]).toContain("| C |: B |");
    expect(renderAbc.mock.calls[0]?.[1]).not.toContain("| C | |: B |");
  });

  it("loads the installed abcjs engine dynamically", async () => {
    const engine = await loadStaffRendererEngine();

    expect(engine.renderAbc).toBeTypeOf("function");
  });
});
