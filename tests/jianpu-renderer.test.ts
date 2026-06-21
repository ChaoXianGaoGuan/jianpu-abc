import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import { renderJianpu } from "../src/renderers/jianpu-renderer";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

function measureTransforms(svg: string): Array<{ x: string; y: string }> {
  return [...svg.matchAll(/class="measure"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/g)]
    .map((match) => ({ x: match[1] ?? "", y: match[2] ?? "" }));
}

function numericMeasureTransforms(svg: string): Array<{ x: number; y: number }> {
  return measureTransforms(svg)
    .map((transform) => ({ x: Number(transform.x), y: Number(transform.y) }));
}

function viewBoxWidth(svg: string): number {
  const match = /viewBox="0 0 ([\d.]+) /.exec(svg);
  return Number(match?.[1] ?? 0);
}

function svgHeight(svg: string): number {
  const match = /height="([\d.]+)"/.exec(svg);
  return Number(match?.[1] ?? 0);
}

function durationLineSegments(svg: string): Array<{ level: number; groupSize: number; x1: number; x2: number }> {
  return [...svg.matchAll(/class="duration-line" data-line-level="(\d+)" data-group-size="(\d+)" x1="([\d.-]+)"[^>]* x2="([\d.-]+)"/g)]
    .map((match) => ({
      level: Number(match[1]),
      groupSize: Number(match[2]),
      x1: Number(match[3]),
      x2: Number(match[4]),
    }));
}

function barlineXs(svg: string): number[] {
  return [...svg.matchAll(/class="barline-(?:thin|thick)" x1="([\d.-]+)"/g)]
    .map((match) => Number(match[1]));
}

function singleBarlineXs(svg: string): number[] {
  return [...svg.matchAll(/class="barline barline-single"[^>]*>\s*<line class="barline-thin" x1="([\d.-]+)"/g)]
    .map((match) => Number(match[1]));
}

function repeatStartBoundaryXs(svg: string): number[] {
  return [...svg.matchAll(/class="barline barline-repeat-start"[^>]*>\s*<line class="barline-thick" x1="([\d.-]+)"/g)]
    .map((match) => Number(match[1]));
}

function repeatMarkerXs(svg: string, kind: string): number[] {
  return [...svg.matchAll(new RegExp(`class="event-repeat-marker event-repeat-marker-${kind}" x="([\\d.-]+)"`, "g"))]
    .map((match) => Number(match[1]));
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

  it("renders readable header text with separated metadata fields", () => {
    const svg = renderJianpu(parse(SCORE), { fontSize: 32 });

    expect(svg).toContain(".score-title{font:600 30.4px");
    expect(svg).toContain(".score-meta{font:650 17.92px");
    expect(svg).toContain(".score-composer{font:600 16px");
    expect(svg).toContain('<text class="score-meta" x="32" y="70.4"><tspan>1=C</tspan><tspan dx="30.4">4/4</tspan><tspan dx="30.4">1/4=120</tspan></text>');
  });

  it("can render compact previews without score header text", () => {
    const svg = renderJianpu(parse(SCORE), { showHeader: false });

    expect(svg).not.toContain('class="score-title"');
    expect(svg).not.toContain('class="score-meta"');
    expect(svg).toContain('class="event-symbol"');
  });

  it("can scope SVG styles to avoid leaking between previews", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1 |"), { styleScope: "measure-preview" });

    expect(svg).toContain('class="jianpu-score measure-preview"');
    expect(svg).toContain(".measure-preview .event-symbol");
  });

  it("renders inline key change markers above the melody", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1 [K:G jianpu] 1 |"));

    expect(svg).toContain("event-key-change");
    expect(svg).toContain('y="-45.44">1=G</text>');
    expect(svg).not.toContain('y="0">1=G</text>');
  });

  it("renders repeat navigation markers above the melody", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| !segno! 1 2 !D.S.! | !coda! 3 !fine! |"));

    expect(svg).toContain("event-repeat-marker");
    expect(svg).toContain("event-repeat-marker-segno");
    expect(svg).toContain("event-repeat-marker-coda");
    expect(svg).toContain('y="-39.04">𝄋</text>');
    expect(svg).toContain('y="38.4">D.S.</text>');
    expect(svg).toContain('y="-39.04">𝄌</text>');
    expect(svg).toContain('y="38.4">Fine</text>');
  });

  it("aligns a leading coda marker with the preceding same-row barline", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1 | !coda! 2 |"));
    const transforms = numericMeasureTransforms(svg);
    const previousBarlineX = transforms[0]!.x + singleBarlineXs(svg)[0]!;
    const codaX = transforms[1]!.x + repeatMarkerXs(svg, "coda")[0]!;

    expect(codaX).toBeCloseTo(previousBarlineX, 3);
  });

  it("joins duration underlines across inline key changes within the same beat", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 7/2 [K:E jianpu] 1/2 |"));
    const levelOneLines = durationLineSegments(svg).filter((line) => line.level === 1);

    expect(levelOneLines).toHaveLength(1);
    expect(levelOneLines[0]).toMatchObject({ groupSize: 2 });
  });

  it("places larger duration dots beside the vertical center of the number", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1. |"), { fontSize: 32 });

    expect(svg).toContain('class="duration-dot"');
    expect(svg).toContain('cy="-12.16" r="2.88"');
  });

  it("keeps dotted rhythm spacing while placing duration dots near the note", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 6/4 1'/2. |"), { fontSize: 32 });

    expect(svg).toContain('class="event-symbol" x="13.12" y="0">6</text>');
    expect(svg).toContain('class="event-symbol" x="39.36" y="0">1</text>');
    expect(svg).toContain('class="duration-dot" cx="52.16"');
    expect(svg).toContain('data-line-level="1" data-group-size="2" x1="2.24" y1="13.76" x2="60.48"');
  });

  it("keeps duration dots close to the note when the dotted note comes first", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 1'/2. 6/4 |"), { fontSize: 32 });

    expect(svg).toContain('class="event-symbol" x="13.12" y="0">1</text>');
    expect(svg).toContain('class="duration-dot" cx="25.92"');
    expect(svg).toContain('class="event-symbol" x="65.6" y="0">6</text>');
  });

  it("renders larger accidentals and standard double accidental glyphs", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| #4 ##4 b7 bb7 =3 |"), { fontSize: 40 });

    expect(svg).toContain(".event-accidental{font:700 32px");
    expect(svg).toContain(">♯</text>");
    expect(svg).toContain(">𝄪</text>");
    expect(svg).toContain(">♭</text>");
    expect(svg).toContain(">𝄫</text>");
    expect(svg).toContain(">♮</text>");
  });

  it("places accidentals close to the upper-left of the note number", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| #4 |"), { fontSize: 40 });

    expect(svg).toContain('class="event-accidental" x="14.8" y="-18"');
  });

  it("spaces notes within a beat in proportion to their durations", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 1/2 2/4 3/4 |"), { fontSize: 32 });

    expect(svg).toContain('data-event-id="default:0:0" aria-label="1/2"><rect class="event-bg" x="5.25"');
    expect(svg).toContain('class="event-symbol" x="26.24" y="0">1</text>');
    expect(svg).toContain('class="event-symbol" x="65.6" y="0">2</text>');
    expect(svg).toContain('class="event-symbol" x="91.84" y="0">3</text>');
  });

  it("preserves readable spacing on narrow previews by scaling the wider viewBox", () => {
    const svg = renderJianpu(
      parse("M:4/4\nL:1/16\nK:C jianpu\n| 1 2 3 4 5 6 7 1' 2' 3' 4' 5' 6' 7' 1'' 2'' |"),
      { width: 320, fontSize: 32 },
    );

    expect(viewBoxWidth(svg)).toBeGreaterThan(320);
    expect(svg).toContain('width="100%"');
    expect(svgHeight(svg)).toBeLessThan(216);
  });

  it("keeps two sixteenths in the first half and an eighth in the second half", () => {
    const svg = renderJianpu(parse("M:4/4\nK:C jianpu\n| 1s 2s 3e |"), { fontSize: 32 });

    expect(svg).toContain('class="event-symbol" x="13.12" y="0">1</text>');
    expect(svg).toContain('class="event-symbol" x="39.36" y="0">2</text>');
    expect(svg).toContain('class="event-symbol" x="78.72" y="0">3</text>');
  });

  it("expands the beat width enough to keep short-note digits readable", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 1/4 2/4 3/4 4/4 |"), { fontSize: 32 });
    const centers = [...svg.matchAll(/class="event-symbol" x="([\d.]+)" y="0">/g)]
      .map((match) => Number(match[1]));

    expect(centers).toEqual([13.12, 39.36, 65.6, 91.84]);
    expect(centers[1]! - centers[0]!).toBeGreaterThanOrEqual(32 * 0.82);
  });

  it("adds visible spacing between adjacent beats", () => {
    const svg = renderJianpu(parse(
      "M:4/4\nL:1/4\nK:C jianpu\n| 1/4 2/4 3/4 4/4 5/4 6/4 7/4 1'/4 |",
    ), { fontSize: 32 });
    const centers = [...svg.matchAll(/class="event-symbol" x="([\d.]+)" y="0">/g)]
      .map((match) => Number(match[1]));

    expect(centers.slice(0, 5)).toEqual([13.12, 39.36, 65.6, 91.84, 127.04]);
    expect(centers[4]! - centers[3]!).toBeGreaterThan(centers[3]! - centers[2]!);
    expect(svg.match(/data-line-level="2" data-group-size="4"/g)).toHaveLength(2);
  });

  it("leaves breathing room between adjacent duration-line beat groups", () => {
    const svg = renderJianpu(parse(
      "M:4/4\nL:1/16\nK:C jianpu\n| 1 2 3 4 5 6 7 1' |",
    ), { fontSize: 32 });
    const levelTwoGroups = durationLineSegments(svg)
      .filter((line) => line.level === 2 && line.groupSize === 4);

    expect(levelTwoGroups).toHaveLength(2);
    expect(levelTwoGroups[1]!.x1 - levelTwoGroups[0]!.x2).toBeGreaterThanOrEqual(20);
  });

  it("keeps terminal duration lines away from the right barline", () => {
    const svg = renderJianpu(parse(
      "M:4/4\nL:1/4\nK:C jianpu\n| 6 0 7e 7s 7s 1e 2e 1e 7s |",
    ), { fontSize: 32 });
    const furthestDurationEnd = Math.max(...durationLineSegments(svg).map((line) => line.x2));
    const rightmostBarline = Math.max(...barlineXs(svg));

    expect(rightmostBarline - furthestDurationEnd).toBeGreaterThanOrEqual(10);
  });

  it("keeps terminal duration lines away from a shared repeat-start boundary", () => {
    const svg = renderJianpu(parse(
      "M:4/4\nL:1/4\nK:C jianpu\n| 7s 7s 7s 1s |: 2 1 7 |",
    ), { fontSize: 32 });
    const transforms = numericMeasureTransforms(svg);
    const durationEnd = transforms[0]!.x + Math.max(...durationLineSegments(svg).map((line) => line.x2));
    const repeatStartX = transforms[1]!.x + repeatStartBoundaryXs(svg)[0]!;

    expect(repeatStartX - durationEnd).toBeGreaterThanOrEqual(10);
  });

  it("aligns underline levels that share the same beat group edge", () => {
    const svg = renderJianpu(parse(
      "M:4/4\nL:1/4\nK:C jianpu\n| 5s 1s 2s 3s 4e 5e |",
    ), { fontSize: 32 });
    const firstBeatLines = durationLineSegments(svg)
      .filter((line) => line.groupSize === 4)
      .slice(0, 2);

    expect(firstBeatLines).toHaveLength(2);
    expect(firstBeatLines[0]!.x1).toBe(firstBeatLines[1]!.x1);
    expect(firstBeatLines[0]!.x2).toBe(firstBeatLines[1]!.x2);
  });

  it("fills explicit source rows when measure column alignment is disabled", () => {
    const width = 620;
    const fontSize = 32;
    const svg = renderJianpu(parse(
      "K:C jianpu\n| 1 | 2 |\n| 1 2 3 4 | 5 |",
    ), { width, fontSize, alignMeasuresAcrossSystems: false });
    const transforms = numericMeasureTransforms(svg);
    const localBarlines = singleBarlineXs(svg);
    const expectedRightBoundary = width - fontSize - fontSize * 0.22;

    expect(transforms[1]!.x + localBarlines[1]!).toBeCloseTo(expectedRightBoundary, 1);
    expect(transforms[3]!.x + localBarlines[3]!).toBeCloseTo(expectedRightBoundary, 1);
  });

  it("fills automatically wrapped rows when measure column alignment is disabled", () => {
    const width = 420;
    const fontSize = 32;
    const svg = renderJianpu(parse(
      "K:C jianpu\n| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 1 | 2 | 3 |",
    ), { width, fontSize, alignMeasuresAcrossSystems: false });
    const transforms = numericMeasureTransforms(svg);
    const localBarlines = singleBarlineXs(svg);
    const expectedRightBoundary = width - fontSize - fontSize * 0.22;
    const rows = new Map<number, number[]>();
    for (const [index, transform] of transforms.entries()) {
      rows.set(transform.y, [...(rows.get(transform.y) ?? []), index]);
    }

    expect(rows.size).toBeGreaterThan(1);
    for (const indexes of rows.values()) {
      const lastIndex = indexes.at(-1)!;
      expect(Math.abs(transforms[lastIndex]!.x + localBarlines[lastIndex]! - expectedRightBoundary))
        .toBeLessThan(0.5);
    }
  });

  it("fills unaligned rows to the expanded readable viewBox width", () => {
    const width = 320;
    const fontSize = 32;
    const svg = renderJianpu(parse(
      "M:4/4\nL:1/16\nK:C jianpu\n| 1 2 3 4 5 6 7 1' 2' 3' 4' 5' 6' 7' 1'' 2'' |\n| 1 | 2 |",
    ), { width, fontSize, alignMeasuresAcrossSystems: false });
    const transforms = numericMeasureTransforms(svg);
    const localBarlines = singleBarlineXs(svg);
    const expectedRightBoundary = viewBoxWidth(svg) - fontSize * 0.2 - fontSize * 0.22;

    expect(viewBoxWidth(svg)).toBeGreaterThan(width);
    expect(transforms[0]!.x + localBarlines[0]!).toBeCloseTo(expectedRightBoundary, 1);
    expect(transforms[2]!.x + localBarlines[2]!).toBeCloseTo(expectedRightBoundary, 1);
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

    expect(svg).toContain('class="relation-arc tie-arc" d="M 32.96 -26.24 Q 52.48 -33.28 72 -26.24"');
  });

  it("renders long notes as beat-sized extension dashes", () => {
    const quarterBeat = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 5*2 6*3 |"));
    const eighthBeat = renderJianpu(parse("M:6/8\nL:1/8\nK:C jianpu\n| 5*2 |"));

    expect(quarterBeat.match(/class="duration-extension"/g)).toHaveLength(3);
    expect(eighthBeat.match(/class="duration-extension"/g)).toHaveLength(1);
    expect(quarterBeat).not.toContain("×2");
    expect(quarterBeat).not.toContain("×3");
  });

  it("can rewrite cross-beat off-beat notes into ordinary tied segments", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 6e 1. 2 3 |");
    const source = renderJianpu(score);
    const beatClear = renderJianpu(score, { rhythmDisplay: "beat-clear" });

    expect(source).not.toContain('class="relation-arc tie-arc"');
    expect(beatClear).toContain('class="relation-arc tie-arc"');
    expect(beatClear).not.toContain('data-beat-clear="split"');
    expect(beatClear).not.toContain("beat-clear-extension");
    expect(beatClear).not.toContain("beat-clear-boundary");
  });

  it("can rewrite dotted notes ending off beat into ordinary tied segments", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 3'e 2's 1's~ ~1'e 5e 2'. 3's 2's |");
    const beatClear = renderJianpu(score, { rhythmDisplay: "beat-clear" });

    expect(beatClear).toContain('class="relation-arc tie-arc"');
    expect(beatClear).not.toContain('data-beat-clear="split"');
  });

  it("can rewrite cross-beat rests without tie arcs", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1e 0. 2 3 |");
    const beatClear = renderJianpu(score, { rhythmDisplay: "beat-clear" });

    expect(beatClear).toContain('aria-label="0"');
    expect(beatClear).not.toContain('class="relation-arc tie-arc"');
  });

  it("connects equal subdivisions within each beat", () => {
    const eighths = renderJianpu(parse("M:4/4\nL:1/8\nK:C jianpu\n| 1 2 3 4 |"));
    const sixteenths = renderJianpu(parse("M:4/4\nL:1/16\nK:C jianpu\n| 1 2 3 4 |"));

    expect(eighths.match(/data-group-size="2"/g)).toHaveLength(2);
    expect(sixteenths.match(/data-group-size="4"/g)).toHaveLength(2);
  });

  it("connects shared underline levels for mixed eighth and sixteenth notes", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/4\nK:C jianpu\n| 1/4 2/ | 3/ 4/4 |"));

    expect(svg.match(/data-line-level="1" data-group-size="2"/g)).toHaveLength(2);
    expect(svg.match(/data-line-level="2" data-group-size="1"/g)).toHaveLength(2);
  });

  it("connects short rests with notes inside the same beat", () => {
    const svg = renderJianpu(parse("M:4/4\nL:1/8\nK:C jianpu\n| 0 1 0 2 |"));

    expect(svg.match(/data-line-level="1" data-group-size="2"/g)).toHaveLength(2);
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

  it("keeps only the repeat-start barline at a shared same-row boundary", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1 |: 7 |"), { fontSize: 32 });

    expect(svg).toContain('class="barline barline-repeat-start"');
    expect(svg.match(/class="barline barline-single"/g)).toHaveLength(1);
    expect(svg).toMatch(/barline-repeat-start[^>]*>\s*<line class="barline-thick" x1="-18\.24"/);
  });

  it("keeps the preceding barline when a repeat starts on a new row", () => {
    const svg = renderJianpu(parse("K:C jianpu\n| 1 |\n|: 7 |"));

    expect(svg).toContain('class="barline barline-repeat-start"');
    expect(svg.match(/class="barline barline-single"/g)).toHaveLength(2);
    expect(svg).toMatch(/barline-repeat-start[^>]*>\s*<line class="barline-thick" x1="0"/);
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

  it("can force a fixed number of measures per row", () => {
    const score = parse("K:C jianpu\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |");
    const svg = renderJianpu(score, { width: 900, measuresPerSystem: 3 });
    const rowPositions = measureTransforms(svg).map((transform) => transform.y);

    expect(rowPositions).toHaveLength(6);
    expect(new Set(rowPositions).size).toBe(2);
    expect(rowPositions[0]).toBe(rowPositions[1]);
    expect(rowPositions[1]).toBe(rowPositions[2]);
    expect(rowPositions[3]).toBe(rowPositions[4]);
    expect(rowPositions[4]).toBe(rowPositions[5]);
    expect(rowPositions[2]).not.toBe(rowPositions[3]);
  });

  it("fills aligned rows when a small fixed measure count is selected", () => {
    const width = 620;
    const fontSize = 32;
    const score = parse("K:C jianpu\n| 1 2 3 1 | 1 2 3 1 | 3 4 5 - | 3 4 5 - | 5 6 5 4 | 3 1 - - |");
    const svg = renderJianpu(score, {
      width,
      fontSize,
      alignMeasuresAcrossSystems: true,
      measuresPerSystem: 2,
    });
    const transforms = numericMeasureTransforms(svg);
    const localBarlines = singleBarlineXs(svg);
    const expectedRightBoundary = width - fontSize - fontSize * 0.22;

    for (const index of [1, 3, 5]) {
      expect(transforms[index]!.x + localBarlines[index]!).toBeCloseTo(expectedRightBoundary, 1);
    }
  });

  it("aligns measure columns across source rows by default", () => {
    const score = parse("K:C jianpu\n| 1 2 3 4 | 1 |\n| 1 | 1 2 3 4 |");
    const svg = renderJianpu(score, { width: 620 });
    const transforms = measureTransforms(svg);

    expect(transforms).toHaveLength(4);
    expect(transforms[0]?.x).toBe(transforms[2]?.x);
    expect(transforms[1]?.x).toBe(transforms[3]?.x);
    expect(transforms[0]?.y).toBe(transforms[1]?.y);
    expect(transforms[2]?.y).toBe(transforms[3]?.y);
  });

  it("keeps aligned columns when narrow scaling preserves readable widths", () => {
    const score = parse("M:4/4\nK:C jianpu\n| 1s 2s 3s 4s 5s 6s 7s 1' | 1 |\n| 1 | 1s 2s 3s 4s 5s 6s 7s 1' |");
    const svg = renderJianpu(score, { width: 320 });
    const transforms = measureTransforms(svg);

    expect(transforms).toHaveLength(4);
    expect(transforms[0]?.x).toBe(transforms[2]?.x);
    expect(transforms[1]?.x).toBe(transforms[3]?.x);
    expect(viewBoxWidth(svg)).toBeGreaterThan(320);
  });

  it("can disable cross-row measure alignment", () => {
    const score = parse("K:C jianpu\n| 1 2 3 4 | 1 |\n| 1 | 1 2 3 4 |");
    const svg = renderJianpu(score, { width: 620, alignMeasuresAcrossSystems: false });
    const transforms = measureTransforms(svg);

    expect(transforms).toHaveLength(4);
    expect(transforms[0]?.x).toBe(transforms[2]?.x);
    expect(transforms[1]?.x).not.toBe(transforms[3]?.x);
  });
});
