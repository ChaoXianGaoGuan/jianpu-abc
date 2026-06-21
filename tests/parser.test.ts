import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";

const DEFAULT_EXAMPLE = `X:1
T:两只老虎
M:4/4
L:1/4
Q:1/4=120
K:C jianpu
| 1 2 3 1 | 1 2 3 1 |
w: 两 只 老 虎 两 只 老 虎
| 3 4 5 - | 3 4 5 - |
w: 跑 得 快 跑 得 快`;

describe("parseJabc", () => {
  it("preserves source music rows as system breaks", () => {
    const result = parseJabc("K:C jianpu\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures.map((measure) => measure.systemBreakAfter ?? false))
      .toEqual([false, true, false, true, false, true]);
  });

  it("parses the default example into a Score AST", () => {
    const result = parseJabc(DEFAULT_EXAMPLE);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.header).toMatchObject({
      index: "1",
      title: "两只老虎",
      meter: { numerator: 4, denominator: 4 },
      defaultNoteLength: { numerator: 1, denominator: 4 },
      tempo: { beat: { numerator: 1, denominator: 4 }, bpm: 120 },
      key: { tonic: "C", notation: "jianpu" },
    });
    expect(result.value.voices[0]?.measures).toHaveLength(4);
    expect(result.value.voices[0]?.measures[0]?.events.map((event) => event.type === "note" ? event.degree : event.type))
      .toEqual([1, 2, 3, 1]);
    expect(result.value.voices[0]?.measures[2]?.events.at(-1)).toMatchObject({
      type: "extension",
      sourceText: "-",
    });
    expect(result.value.voices[0]?.measures.every((measure) => measure.barline?.type === "single")).toBe(true);
  });

  it("parses composer, rests, both rest spellings, and the default duration", () => {
    const result = parseJabc(`C:传统儿歌\nL:1/8\nK:F jianpu\n| 1 0 z - |`);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.header.composer).toBe("传统儿歌");
    expect(result.value.header.key?.tonic).toBe("F");
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 1, duration: { numerator: 1, denominator: 8 } },
      { type: "rest", sourceText: "0", duration: { numerator: 1, denominator: 8 } },
      { type: "rest", sourceText: "z", duration: { numerator: 1, denominator: 8 } },
      { type: "extension", duration: { numerator: 1, denominator: 8 } },
    ]);
  });

  it("retains lyric lines and attaches syllables only to notes", () => {
    const result = parseJabc(`K:C jianpu\n| 1 0 2 - 3 |\nw: 一 二 三`);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.voices[0]?.lyricLines[0]).toMatchObject({
      text: "一 二 三",
      syllables: ["一", "二", "三"],
    });
    const events = result.value.voices[0]?.measures[0]?.events ?? [];
    expect(events.filter((event) => event.type === "note").map((event) => event.type === "note" ? event.lyric : undefined))
      .toEqual(["一", "二", "三"]);
  });

  it("attaches each lyric line to the preceding music source row", () => {
    const result = parseJabc(`K:C jianpu\n| 1 2 |\nw: 第 一\n| 3 4 |\nw: 第 二`);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const events = result.value.voices[0]?.measures.flatMap((measure) => measure.events) ?? [];
    expect(events.filter((event) => event.type === "note").map((event) => event.type === "note" ? event.lyric : undefined))
      .toEqual(["第", "一", "第", "二"]);
  });

  it("leaves music rows without lyrics silent and supports star lyric skips", () => {
    const result = parseJabc(`K:C jianpu\n| 1 2 |\n| 3 4 |\nw: 唱 *`);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const notes = result.value.voices[0]?.measures.flatMap((measure) => measure.events)
      .filter((event) => event.type === "note") ?? [];
    expect(notes.map((event) => event.type === "note" ? event.lyric : undefined))
      .toEqual([undefined, undefined, "唱", undefined]);
  });

  it("does not backfill earlier rows when repeated lyric lines target the same music row", () => {
    const result = parseJabc(`K:C jianpu\n| 1 2 |\n| 3 4 |\nw: 三 四\nw: 重 复`);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const notes = result.value.voices[0]?.measures.flatMap((measure) => measure.events)
      .filter((event) => event.type === "note") ?? [];
    expect(notes.map((event) => event.type === "note" ? event.lyric : undefined))
      .toEqual([undefined, undefined, "三", "四"]);
  });

  it("attaches one lyric to extension, tie, and slur lyric units", () => {
    const result = parseJabc(`K:C jianpu\n| 1 - 2~ | ~2 (4 5) 6. |\nw: 长 连 啊 点`);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const notes = result.value.voices[0]?.measures.flatMap((measure) => measure.events)
      .filter((event) => event.type === "note") ?? [];
    expect(notes.map((event) => event.type === "note" ? event.lyric : undefined))
      .toEqual(["长", "连", undefined, "啊", undefined, "点"]);
  });

  it("parses accidentals and octave suffixes", () => {
    const result = parseJabc("K:C jianpu\n| #4' b7, =3 ##1'' bb2,, |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 4, accidental: "sharp", octaveShift: 1 },
      { type: "note", degree: 7, accidental: "flat", octaveShift: -1 },
      { type: "note", degree: 3, accidental: "natural", octaveShift: 0 },
      { type: "note", degree: 1, accidental: "double-sharp", octaveShift: 2 },
      { type: "note", degree: 2, accidental: "double-flat", octaveShift: -2 },
    ]);
  });

  it("parses duration suffixes and dotted notes/rests", () => {
    const result = parseJabc("L:1/4\nK:C jianpu\n| 1/ 2/2 3/4 4*2 5*3 6. 7.. 0/2 z*2. |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { duration: { numerator: 1, denominator: 8 } },
      { duration: { numerator: 1, denominator: 8 } },
      { duration: { numerator: 1, denominator: 16 } },
      { duration: { numerator: 1, denominator: 2 } },
      { duration: { numerator: 3, denominator: 4 } },
      { duration: { numerator: 3, denominator: 8 }, dots: 1 },
      { duration: { numerator: 7, denominator: 16 }, dots: 2 },
      { type: "rest", duration: { numerator: 1, denominator: 8 } },
      { type: "rest", duration: { numerator: 3, denominator: 4 }, dots: 1 },
    ]);
  });

  it("parses absolute duration letters", () => {
    const result = parseJabc("L:1/2\nK:C jianpu\n| 1w 2h 3q 4e 5s 0e zq. |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", duration: { numerator: 1, denominator: 1 }, sourceText: "1w" },
      { type: "note", duration: { numerator: 1, denominator: 2 }, sourceText: "2h" },
      { type: "note", duration: { numerator: 1, denominator: 4 }, sourceText: "3q" },
      { type: "note", duration: { numerator: 1, denominator: 8 }, sourceText: "4e" },
      { type: "note", duration: { numerator: 1, denominator: 16 }, sourceText: "5s" },
      { type: "rest", duration: { numerator: 1, denominator: 8 }, sourceText: "0e" },
      { type: "rest", duration: { numerator: 3, denominator: 8 }, dots: 1, sourceText: "zq." },
    ]);
  });

  it("combines accidental, octave, duration, and dot modifiers", () => {
    const result = parseJabc("L:1/4\nK:C jianpu\n| #4'/2. |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events[0]).toMatchObject({
      type: "note",
      degree: 4,
      accidental: "sharp",
      octaveShift: 1,
      duration: { numerator: 3, denominator: 16 },
      dots: 1,
      sourceText: "#4'/2.",
    });
  });

  it("ignores full-line and inline comments", () => {
    const result = parseJabc(`% heading comment\nK:C jianpu % key comment\n| 1 2 | % music comment`);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toHaveLength(2);
  });

  it("preserves unsupported header fields in extraFields", () => {
    const result = parseJabc(`A:民歌\nA:儿童歌曲\nK:C jianpu\n| 1 |`);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.header.extraFields).toEqual({ A: ["民歌", "儿童歌曲"] });
  });

  it("parses slur start and end markers", () => {
    const result = parseJabc("K:C jianpu\n| (1 2 3) |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 1, slurStart: true },
      { type: "note", degree: 2 },
      { type: "note", degree: 3, slurEnd: true },
    ]);
  });

  it("parses triplets and scales their durations", () => {
    const result = parseJabc("L:1/4\nK:C jianpu\n| (3 1 2 3 |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 1, duration: { numerator: 1, denominator: 6 }, tuplet: { actual: 3, normal: 2, position: "start" } },
      { type: "note", degree: 2, duration: { numerator: 1, denominator: 6 }, tuplet: { actual: 3, normal: 2, position: "middle" } },
      { type: "note", degree: 3, duration: { numerator: 1, denominator: 6 }, tuplet: { actual: 3, normal: 2, position: "end" } },
    ]);
  });

  it("parses tie start and end markers", () => {
    const result = parseJabc("K:C jianpu\n| 1~ | ~1 | 2~ ~2 |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events[0]).toMatchObject({ type: "note", degree: 1, tieStart: true });
    expect(result.value.voices[0]?.measures[1]?.events[0]).toMatchObject({ type: "note", degree: 1, tieEnd: true });
    expect(result.value.voices[0]?.measures[2]?.events).toMatchObject([
      { type: "note", degree: 2, tieStart: true },
      { type: "note", degree: 2, tieEnd: true },
    ]);
  });

  it("parses a tie from a triplet across a barline into a first ending", () => {
    const result = parseJabc(
      "L:1/4\nK:D jianpu\n| (3 #2'e 1'e 5e~ | [1 ~5e 1'e~ ~1' - - |",
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events.at(-1)).toMatchObject({
      type: "note",
      degree: 5,
      tieStart: true,
      tuplet: { actual: 3, normal: 2, position: "end" },
    });
    const endingMeasure = result.value.voices[0]?.measures[1];
    expect(endingMeasure?.ending).toMatchObject({ number: "1" });
    expect(endingMeasure?.events.slice(0, 3)).toMatchObject([
      { type: "note", degree: 5, tieEnd: true },
      { type: "note", degree: 1, octaveShift: 1, tieStart: true },
      { type: "note", degree: 1, octaveShift: 1, tieEnd: true },
    ]);
  });

  it("parses repeat, final, double barlines, and endings", () => {
    const result = parseJabc("K:C jianpu\n|: 1 2 :| [1 3 || [2 4 |]");

    expect(result.success).toBe(true);
    if (!result.success) return;
    const measures = result.value.voices[0]?.measures ?? [];
    expect(measures).toHaveLength(3);
    expect(measures[0]).toMatchObject({
      leftBarline: { type: "repeat-start", sourceText: "|:" },
      barline: { type: "repeat-end", sourceText: ":|" },
    });
    expect(measures[1]).toMatchObject({ ending: { number: "1", sourceText: "[1" }, barline: { type: "double", sourceText: "||" } });
    expect(measures[2]).toMatchObject({ ending: { number: "2", sourceText: "[2" }, barline: { type: "final", sourceText: "|]" } });
  });

  it("parses V fields as separate voices with independent lyrics", () => {
    const result = parseJabc(`K:C jianpu\nV:melody\n| 1 2 |\nw: 高 音\nV:bass\n| 1, 5, |\nw: 低 音`);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices.map((voice) => voice.id)).toEqual(["melody", "bass"]);
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 1, lyric: "高" },
      { type: "note", degree: 2, lyric: "音" },
    ]);
    expect(result.value.voices[1]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 1, octaveShift: -1, lyric: "低" },
      { type: "note", degree: 5, octaveShift: -1, lyric: "音" },
    ]);
  });

  it("parses inline voice markers", () => {
    const result = parseJabc("K:C jianpu\n[V:1] | 1 2 |\n[V:2] | 3 4 |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices.map((voice) => voice.id)).toEqual(["1", "2"]);
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([{ degree: 1 }, { degree: 2 }]);
    expect(result.value.voices[1]?.measures[0]?.events).toMatchObject([{ degree: 3 }, { degree: 4 }]);
  });

  it("parses repeat navigation markers as zero-duration events", () => {
    const result = parseJabc("K:C jianpu\n| !segno! 1 2 !D.S.! | !coda! 3 !fine! |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "repeat-marker", kind: "segno", text: "𝄋", sourceText: "!segno!" },
      { type: "note", degree: 1 },
      { type: "note", degree: 2 },
      { type: "repeat-marker", kind: "ds", text: "D.S.", sourceText: "!D.S.!" },
    ]);
    expect(result.value.voices[0]?.measures[1]?.events).toMatchObject([
      { type: "repeat-marker", kind: "coda", text: "𝄌", sourceText: "!coda!" },
      { type: "note", degree: 3 },
      { type: "repeat-marker", kind: "fine", text: "Fine", sourceText: "!fine!" },
    ]);
  });

  it("parses inline key changes with spaces", () => {
    const result = parseJabc("K:C jianpu\n| 1 [K:G jianpu] 1 |");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.voices[0]?.measures[0]?.events).toMatchObject([
      { type: "note", degree: 1 },
      { type: "key-change", key: { tonic: "G", notation: "jianpu" }, sourceText: "[K:G jianpu]" },
      { type: "note", degree: 1 },
    ]);
  });

  it("rejects empty V fields", () => {
    const result = parseJabc("K:C jianpu\nV:\n| 1 |");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]).toMatchObject({ message: 'Invalid V: field value "".' });
  });

  it("rejects key tonics outside the declared PitchClass set", () => {
    const result = parseJabc("K:E# jianpu");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]).toMatchObject({
      message: 'Invalid K: field value "E# jianpu".',
      token: "E# jianpu",
    });
  });

  it("rejects invalid inline key changes", () => {
    const result = parseJabc("K:C jianpu\n| 1 [K:E# jianpu] 2 |");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]).toMatchObject({
      message: 'Invalid inline K: key change "[K:E# jianpu]".',
      line: 2,
      column: 5,
      token: "[K:E# jianpu]",
      context: "| 1 [K:E# jianpu] 2 |",
    });
    expect(result.errors[0]?.suggestion).toContain("[K:G jianpu]");
  });

  it("returns structured errors with source location and a suggestion", () => {
    const result = parseJabc(`K:C jianpu\n| 1 8 3 |`);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]).toMatchObject({
      type: "ParseError",
      message: 'Unknown token "8".',
      line: 2,
      column: 5,
      context: "| 1 8 3 |",
      token: "8",
    });
    expect(result.errors[0]?.suggestion).toContain("1-7");
  });

  it.each(["1',", "1/0", "1*0", "1...", "###4"])(
    "rejects invalid modified token %s",
    (token) => {
      const result = parseJabc(`K:C jianpu\n| ${token} |`);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors[0]).toMatchObject({ token, line: 2, column: 3 });
    },
  );

  it.each([
    ["M:four-four", "M"],
    ["L:quarter", "L"],
    ["Q:fast", "Q"],
    ["K:C", "K"],
  ])("reports an invalid %s header", (line, field) => {
    const result = parseJabc(line);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.message).toContain(`Invalid ${field}:`);
  });
});
