import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import { renderJianpu } from "../src/renderers/jianpu-renderer";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

const SCORE = `T:渲染测试 <曲>
C:传统来源
M:4/4
L:1/4
Q:1/4=120
K:C jianpu
| 1' #4/2. 0 1, - |
w: 高 升 低`;

describe("renderJianpu", () => {
  it("renders score metadata, events, notation marks, and lyrics", () => {
    const svg = renderJianpu(parse(SCORE));

    expect(svg).toContain("<svg");
    expect(svg).toContain("渲染测试 &lt;曲&gt;");
    expect(svg).toContain("1=C");
    expect(svg).toContain("4/4");
    expect(svg).toContain("1/4=120");
    expect(svg).toContain("传统来源");
    expect(svg).toContain('data-event-id="default:0:0"');
    expect(svg).toContain('class="event-symbol"');
    expect(svg).toContain(">♯</text>");
    expect(svg).toContain(">0</text>");
    expect(svg).toContain(">−</text>");
    expect(svg).toContain('class="octave-dot"');
    expect(svg).toContain('class="duration-line"');
    expect(svg).toContain('class="duration-dot"');
    expect(svg).toContain(">高</text>");
    expect(svg).toContain(">升</text>");
    expect(svg).toContain(">低</text>");
  });

  it("places larger duration dots beside the vertical center of the number", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1. |"), { fontSize: 32 });

    expect(svg).toContain('class="duration-dot"');
    expect(svg).toContain('cy="-12.16" r="2.88"');
  });

  it("adds the highlight class to the requested source event", () => {
    const svg = renderJianpu(parse(SCORE), { highlightEventId: "default:0:1" });

    expect(svg).toContain('class="jabc-event is-highlighted" data-event-id="default:0:1"');
  });

  it("renders slur marks", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| (1 2 3) |"));

    expect(svg).toContain('class="relation-arc slur-arc"');
    expect(svg).toMatch(/slur-arc" d="M [^"]+ C /);
    expect(svg).not.toContain(">(</text>");
  });

  it("renders triplet marks", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| (3 1 2 3 |"));

    expect(svg.match(/class="relation-arc tuplet-arc"/g)).toHaveLength(2);
    expect(svg).toContain('class="tuplet-number"');
    expect(svg).not.toContain("relation-label-bg");
    expect(svg).toContain(">3</text>");
  });

  it("renders tie marks", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1~ | ~1 |"));

    expect(svg.match(/class="relation-arc tie-arc/g)).toHaveLength(1);
    expect(svg).toContain("cross-measure-tie");
    expect(svg).toContain("cross-measure-tie-mask");
    expect(svg.match(/cross-measure-tie" d="[^"]* C /)).not.toBeNull();
    expect(svg).not.toContain(">~</text>");
  });

  it("splits cross-measure ties when the measures are on different rows", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1~ |\n| ~1 |"));

    expect(svg.match(/class="relation-arc tie-arc/g)).toHaveLength(2);
    expect(svg).not.toContain("cross-measure-tie");
  });

  it("draws same-measure ties between number edges instead of through centers", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 3~ ~3 |"), { fontSize: 32 });

    expect(svg).toContain('class="relation-arc tie-arc" d="M 32.96 -26.24 Q 48 -33.28 63.04 -26.24"');
  });

  it("renders long notes as beat-sized extension dashes", () => {
    const quarterBeat = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 5*2 6*3 |"));
    const eighthBeat = renderJianpu(parse("M:6/8\nL:1/8\nK:C jianpu\n| 5*2 |"));

    expect(quarterBeat.match(/class="duration-extension"/g)).toHaveLength(3);
    expect(eighthBeat.match(/class="duration-extension"/g)).toHaveLength(1);
    expect(quarterBeat).not.toContain("×2");
    expect(quarterBeat).not.toContain("×3");
  });

  it("connects equal subdivisions within each beat", () => {
    const eighths = renderJianpu(parse("M:4/4\nL:1/8\nK:C jianpu\n| 1 2 3 4 |"));
    const sixteenths = renderJianpu(parse("M:4/4\nL:1/16\nK:C jianpu\n| 1 2 3 4 |"));

    expect(eighths.match(/data-group-size="2"/g)).toHaveLength(2);
    expect(sixteenths.match(/data-group-size="4"/g)).toHaveLength(2);
  });

  it("renders repeat barlines and endings", () => {
    const svg = renderJianpu(parse("K:C jianpu\n|: 1 :| [1 2 || [2 3 |]"));

    expect(svg).toContain('class="barline barline-repeat-start"');
    expect(svg).toContain('class="barline barline-repeat-end"');
    expect(svg).toContain('class="barline barline-double"');
    expect(svg).toContain('class="barline barline-final"');
    expect(svg.match(/class="repeat-dot"/g)).toHaveLength(4);
    expect(svg).toContain('class="ending-bracket"');
    expect(svg).toContain('class="ending-number"');
    expect(svg).toContain(">1.</text>");
    expect(svg).toContain(">2.</text>");
    expect(svg).not.toContain(">|:</text>");
  });

  it("renders multiple voices with voice labels", () => {
    const svg = renderJianpu(parse(`K:C jianpu\nV:melody\n| 1 2 |\nV:bass\n| 1, 5, |`));

    expect(svg).toContain('class="voice-label"');
    expect(svg).toContain(">melody</text>");
    expect(svg).toContain(">bass</text>");
    expect(svg).toContain('data-event-id="melody:0:0"');
    expect(svg).toContain('data-event-id="bass:0:0"');
  });

  it("can hide lyrics", () => {
    const svg = renderJianpu(parse(SCORE), { showLyrics: false });

    expect(svg).not.toContain('class="event-lyric"');
    expect(svg).not.toContain(">高</text>");
  });

  it("wraps measures onto multiple SVG rows at narrow widths", () => {
    const score = parse("K:C jianpu\n| 1 2 3 4 | 1 2 3 4 | 1 2 3 4 | 1 2 3 4 |");
    const svg = renderJianpu(score, { width: 320 });
    const rowPositions = [...svg.matchAll(/class="measure"[^>]*transform="translate\([^ ]+ ([^)]+)\)"/g)]
      .map((match) => match[1]);

    expect(rowPositions).toHaveLength(4);
    expect(new Set(rowPositions).size).toBeGreaterThan(1);
  });

  it("preserves source rows at narrow widths instead of adding layout breaks", () => {
    const score = parse("K:C jianpu\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |");
    const svg = renderJianpu(score, { width: 320 });
    const rowPositions = [...svg.matchAll(/class="measure"[^>]*transform="translate\([^ ]+ ([^)]+)\)"/g)]
      .map((match) => match[1]);

    expect(new Set(rowPositions).size).toBe(3);
    expect(rowPositions[0]).toBe(rowPositions[1]);
    expect(rowPositions[2]).toBe(rowPositions[3]);
    expect(rowPositions[4]).toBe(rowPositions[5]);
  });
});
