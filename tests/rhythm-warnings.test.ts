import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import { rhythmWarningMessages } from "../src/web/rhythm-warnings";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe("rhythmWarningMessages", () => {
  it("does not warn for complete measures with clear beat starts", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1 2 3 4 |");

    expect(rhythmWarningMessages(score)).toEqual([]);
  });

  it("warns about underfull measures", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1 2 |");

    expect(rhythmWarningMessages(score)[0]).toContain("第 1 小节：总时值 1/2 少于拍号需要的 1/1");
  });

  it("warns about cross-beat dotted rhythms that hide a beat boundary", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 6e 1. 2 3 |");

    expect(rhythmWarningMessages(score)).toContain(
      "第 1 小节第 2 个事件 “1.” 跨过拍点；若需要每拍更清楚，可考虑用延音线或分拍写法。",
    );
  });

  it("warns when a dotted quarter starts on a beat but ends off the next beat", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 3'e 2's 1's~ ~1'e 5e 2'. 3's 2's |");

    expect(rhythmWarningMessages(score)).toContain(
      "第 1 小节第 6 个事件 “2'.” 跨过拍点；若需要每拍更清楚，可考虑用延音线或分拍写法。",
    );
  });

  it("warns about cross-beat rests that hide a beat boundary", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1e 0. 2 3 |");

    expect(rhythmWarningMessages(score)).toContain(
      "第 1 小节第 2 个事件 “0.” 跨过拍点；若需要每拍更清楚，可考虑用延音线或分拍写法。",
    );
  });

  it("uses the manual fallback meter when the score has no M header", () => {
    const score = parse("L:1/4\nK:C jianpu\n| 1 2 |");

    expect(rhythmWarningMessages(score, { numerator: 4, denominator: 4 })[0]).toContain("少于拍号需要的 1/1");
  });
});
