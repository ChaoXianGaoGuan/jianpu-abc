import { describe, expect, it } from "vitest";
import type { JianpuKey } from "../src/core/ast";
import { degreeToPitch, toAbcPitchToken } from "../src/core/pitch";

const key = (tonic: JianpuKey["tonic"]): JianpuKey => ({
  tonic,
  notation: "jianpu",
});

describe("degreeToPitch", () => {
  it("maps C major degrees to absolute pitch representations", () => {
    expect(degreeToPitch({ key: key("C"), degree: 1 })).toMatchObject({
      name: "C4",
      pitchClass: "C",
      midi: 60,
      abc: "C",
      musicXml: { step: "C", octave: 4 },
    });
    expect(degreeToPitch({ key: key("C"), degree: 7 })).toMatchObject({
      name: "B4",
      midi: 71,
      abc: "B",
    });
  });

  it("maps D major and crosses into the next octave", () => {
    expect(degreeToPitch({ key: key("D"), degree: 3 })).toMatchObject({
      name: "F#4",
      midi: 66,
      abc: "^F",
      musicXml: { step: "F", alter: 1, octave: 4 },
    });
    expect(degreeToPitch({ key: key("D"), degree: 7 })).toMatchObject({
      name: "C#5",
      midi: 73,
      abc: "^c",
    });
  });

  it("uses flat spelling for F major", () => {
    expect(degreeToPitch({ key: key("F"), degree: 4 })).toMatchObject({
      name: "Bb4",
      midi: 70,
      abc: "_B",
    });
    expect(degreeToPitch({ key: key("F"), degree: 5 })).toMatchObject({
      name: "C5",
      midi: 72,
      abc: "c",
    });
  });

  it("applies octave shifts and explicit accidentals", () => {
    expect(degreeToPitch({ key: key("C"), degree: 1, octaveShift: 1 }).abc).toBe("c");
    expect(degreeToPitch({ key: key("C"), degree: 1, octaveShift: -1 }).abc).toBe("C,");

    const loweredThird = degreeToPitch({ key: key("D"), degree: 3, accidental: "flat" });
    expect(loweredThird).toMatchObject({ name: "F4", midi: 65, abc: "F" });
    expect(toAbcPitchToken(loweredThird, true)).toBe("=F");
  });

  it("rejects modes whose scale intervals are not implemented", () => {
    expect(() => degreeToPitch({
      key: { tonic: "A", mode: "minor", notation: "jianpu" },
      degree: 3,
    })).toThrow(/supports major keys only/);
  });
});
