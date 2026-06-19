import type { AbcVisualParams, Selector, TuneObjectArray } from "abcjs";
import type { Score } from "../core/ast";
import { toStandardAbc } from "../converters/to-abc";

export interface StaffRenderOptions {
  responsive?: boolean;
  scale?: number;
  staffWidth?: number;
}

export interface StaffRendererEngine {
  renderAbc(target: Selector, abc: string, params?: AbcVisualParams): TuneObjectArray;
}

let enginePromise: Promise<StaffRendererEngine> | undefined;

export function toStaffAbc(score: Score): string {
  return toStandardAbc(score);
}

export function renderStaff(
  target: Selector,
  score: Score,
  options: StaffRenderOptions = {},
  engine: StaffRendererEngine,
): TuneObjectArray {
  const abc = toStaffAbc(score);
  const params: AbcVisualParams = {
    add_classes: true,
    oneSvgPerLine: false,
    ...(options.responsive === false ? {} : { responsive: "resize" }),
    ...(options.scale === undefined ? {} : { scale: options.scale }),
    ...(options.staffWidth === undefined ? {} : { staffwidth: options.staffWidth }),
  };
  return engine.renderAbc(target, abc, params);
}

export function loadStaffRendererEngine(): Promise<StaffRendererEngine> {
  enginePromise ??= import("abcjs").then((loaded) => {
    const module = loaded as unknown as StaffRendererEngine & {
      default?: StaffRendererEngine;
    };
    const engine = typeof module.renderAbc === "function" ? module : module.default;
    if (!engine || typeof engine.renderAbc !== "function") {
      throw new Error("abcjs did not expose a renderAbc function.");
    }
    return engine;
  });
  return enginePromise;
}

export async function renderStaffAsync(
  target: Selector,
  score: Score,
  options: StaffRenderOptions = {},
): Promise<TuneObjectArray> {
  const engine = await loadStaffRendererEngine();
  return renderStaff(target, score, options, engine);
}
