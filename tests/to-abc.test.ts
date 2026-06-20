import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import { AbcExportError, toStandardAbc } from "../src/converters/to-abc";
import inputGolden from "./fixtures/two-tigers.jabc?raw";
import expectedGolden from "./fixtures/two-tigers.abc?raw";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe("toStandardAbc", () => {
  it("preserves source rows in the ABC body", () => {
    const score = parse("K:C jianpu\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |");

    expect(toStandardAbc(score)).toBe(
      "X:1\nL:1/4\nK:C\n| C | D |\n| E | F |\n| G | A |\n",
    );
  });

  it("matches the two-tigers golden ABC output", () => {
    expect(toStandardAbc(parse(inputGolden))).toBe(expectedGolden);
  });

  it("preserves the composer header", () => {
    const score = parse("X:2\nT:测试\nC:传统民歌\nK:C jianpu\n| 1 |");

    expect(toStandardAbc(score)).toContain("X:2\nT:测试\nC:传统民歌\n");
  });

  it.each([
    ["D", "D E F G A B c"],
    ["F", "F G A B c d e"],
  ] as const)("exports scale degrees in K:%s using the ABC key signature", (tonic, notes) => {
    const score = parse(`K:${tonic} jianpu\n| 1 2 3 4 5 6 7 |`);

    expect(toStandardAbc(score)).toBe(
      `X:1\nL:1/4\nK:${tonic}\n| ${notes} |\n`,
    );
  });

  it("exports rests and fractional durations", () => {
    const score = parse("L:1/4\nK:C jianpu\n| 1 0 z |");
    const firstNote = score.voices[0]?.measures[0]?.events[0];
    if (!firstNote || firstNote.type !== "note") throw new Error("Expected first note");
    firstNote.duration = { numerator: 1, denominator: 8 };

    expect(toStandardAbc(score)).toContain("| C1/2 z z |");
  });

  it("groups equal subdivisions within a beat for staff beaming", () => {
    const score = parse("M:4/4\nL:1/4\nK:C jianpu\n| 1/2 2/2 3/2 4/2 | 5/4 6/4 7/4 1'/4 |");

    expect(toStandardAbc(score)).toContain("| C1/2D1/2 E1/2F1/2 | G1/4A1/4B1/4c1/4 |");
  });

  it("uses explicit ABC accidentals when a note overrides the key", () => {
    const score = parse("K:D jianpu\n| 3 4 |");
    const events = score.voices[0]?.measures[0]?.events;
    const third = events?.[0];
    const fourth = events?.[1];
    if (third?.type !== "note" || fourth?.type !== "note") throw new Error("Expected notes");
    third.accidental = "flat";
    fourth.accidental = "sharp";

    expect(toStandardAbc(score)).toContain("| =F ^G |");
  });

  it("exports inline key changes and maps following degrees with the new tonic", () => {
    const score = parse("K:C jianpu\n| 1 [K:G jianpu] 1 | 2 |");

    expect(toStandardAbc(score)).toBe("X:1\nL:1/4\nK:C\n| C [K:G] G | A |\n");
  });

  it("exports parsed octave, accidental, duration, and dot syntax", () => {
    const score = parse("L:1/4\nK:C jianpu\n| 1' 1, #4 b7 =3 1/2 2*2 3. |");

    expect(toStandardAbc(score)).toContain("| c C, ^F _B =E C1/2 D2 E3/2 |");
  });

  it("exports slurs using standard ABC slur syntax", () => {
    const score = parse("K:C jianpu\n| (1 2 3) |");

    expect(toStandardAbc(score)).toBe("X:1\nL:1/4\nK:C\n| (C D E) |\n");
  });

  it("exports triplets using standard ABC tuplet syntax", () => {
    const score = parse("L:1/4\nK:C jianpu\n| (3 1 2 3 |");

    expect(toStandardAbc(score)).toBe("X:1\nL:1/4\nK:C\n| (3C D E |\n");
  });

  it("exports ties using standard ABC tie syntax", () => {
    const score = parse("K:C jianpu\n| 1~ | ~1 |");

    expect(toStandardAbc(score)).toBe("X:1\nL:1/4\nK:C\n| C- | C |\n");
  });

  it("preserves repeat, final, double barlines, and endings", () => {
    const score = parse("K:C jianpu\n|: 1 2 :| [1 3 || [2 4 |]");

    expect(toStandardAbc(score)).toBe("X:1\nL:1/4\nK:C\n|: C D :| [1 E || [2 F |]\n");
  });

  it("exports multiple voices with V fields", () => {
    const score = parse(`X:7\nT:双声部\nM:4/4\nL:1/4\nK:C jianpu\nV:melody\n| 1 2 |\nw: 高 音\nV:bass\n| 1, 5, |\nw: 低 音`);

    expect(toStandardAbc(score)).toBe(
      "X:7\nT:双声部\nM:4/4\nL:1/4\nV:melody\nV:bass\nK:C\nV:melody\n| C D |\nw: 高 音\nV:bass\n| C, G, |\nw: 低 音\n",
    );
  });

  it("reports an orphan extension instead of producing invalid ABC", () => {
    const score = parse("K:C jianpu\n| - 1 |");

    expect(() => toStandardAbc(score)).toThrowError(AbcExportError);
    try {
      toStandardAbc(score);
    } catch (error) {
      expect(error).toMatchObject({ code: "ORPHAN_EXTENSION" });
    }
  });

  it("requires a key before exporting pitches", () => {
    const score = parse("| 1 2 |");
    expect(() => toStandardAbc(score)).toThrow(/without a JABC K: field/);
  });
});
