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

  it("adds the highlight class to the requested source event", () => {
    const svg = renderJianpu(parse(SCORE), { highlightEventId: "default:0:1" });

    expect(svg).toContain('class="jabc-event is-highlighted" data-event-id="default:0:1"');
  });

  it("renders slur marks", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| (1 2 3) |"));

    expect(svg).toContain('class="slur-mark"');
    expect(svg).toContain(">(</text>");
    expect(svg).toContain(">)</text>");
  });

  it("renders triplet marks", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| (3 1 2 3 |"));

    expect(svg).toContain('class="tuplet-mark"');
    expect(svg).toContain(">(3</text>");
  });

  it("renders tie marks", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1~ | ~1 |"));

    expect(svg).toContain('class="tie-mark"');
    expect(svg.match(/>~<\/text>/g)).toHaveLength(2);
  });

  it("renders repeat barlines and endings", () => {
    const svg = renderJianpu(parse("K:C jianpu\n|: 1 :| [1 2 || [2 3 |]"));

    expect(svg).toContain(">|:</text>");
    expect(svg).toContain(">:|</text>");
    expect(svg).toContain(">[1</text>");
    expect(svg).toContain(">||</text>");
    expect(svg).toContain(">[2</text>");
    expect(svg).toContain(">|]</text>");
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
});
