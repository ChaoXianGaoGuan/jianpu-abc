import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import { MusicXmlExportError, toMusicXml } from "../src/converters/to-musicxml";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe("toMusicXml", () => {
  it("preserves source rows as MusicXML system breaks", () => {
    const xml = toMusicXml(parse("K:C jianpu\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |"));

    expect(xml.match(/<print new-system="yes" \/>/g)).toHaveLength(2);
    expect(xml).toMatch(/<measure number="3">\n      <print new-system="yes" \/>/);
    expect(xml).toMatch(/<measure number="5">\n      <print new-system="yes" \/>/);
  });

  it("exports a partwise MusicXML document with metadata and attributes", () => {
    const score = parse(`X:1
T:两只老虎
C:传统儿歌
M:4/4
L:1/4
Q:1/4=120
K:C jianpu
| 1 2 3 1 |
w: 两 只 老 虎`);

    const xml = toMusicXml(score);

    expect(xml).toContain("<score-partwise version=\"4.0\">");
    expect(xml).toContain("<work-title>两只老虎</work-title>");
    expect(xml).toContain("<creator type=\"composer\">传统儿歌</creator>");
    expect(xml).toContain("<divisions>480</divisions>");
    expect(xml).toContain("<fifths>0</fifths>");
    expect(xml).toContain("<beats>4</beats>");
    expect(xml).toContain("<beat-type>4</beat-type>");
    expect(xml).toContain("<per-minute>120</per-minute>");
    expect(xml).toContain("<step>C</step>");
    expect(xml).toContain("<step>D</step>");
    expect(xml).toContain("<step>E</step>");
    expect(xml).toContain("<text>两</text>");
  });

  it("exports key signatures and altered pitches", () => {
    const score = parse("K:D jianpu\n| 1 2 3 4 5 6 7 |");
    const xml = toMusicXml(score);

    expect(xml).toContain("<fifths>2</fifths>");
    expect(xml).toContain("<step>F</step>");
    expect(xml).toContain("<alter>1</alter>");
    expect(xml).toContain("<step>C</step>\n          <alter>1</alter>\n          <octave>5</octave>");
  });

  it("exports rests, durations, dots, and extensions", () => {
    const score = parse("L:1/4\nK:C jianpu\n| 1 - 0/2 3. |");
    const xml = toMusicXml(score);

    expect(xml).toContain("<duration>960</duration>");
    expect(xml).toContain("<rest />");
    expect(xml).toContain("<duration>240</duration>");
    expect(xml).toContain("<duration>720</duration>");
    expect(xml).toContain("<dot />");
  });

  it("escapes XML text content", () => {
    const score = parse("T:A & B < C\nC:Me & You\nK:C jianpu\n| 1 |");
    const xml = toMusicXml(score);

    expect(xml).toContain("<work-title>A &amp; B &lt; C</work-title>");
    expect(xml).toContain("<creator type=\"composer\">Me &amp; You</creator>");
  });

  it("exports slurs to MusicXML slur notations", () => {
    const score = parse("K:C jianpu\n| (1 2 3) |");
    const xml = toMusicXml(score);

    expect(xml).toContain("<slur type=\"start\" />");
    expect(xml).toContain("<slur type=\"stop\" />");
  });

  it("exports triplets to MusicXML time-modification and tuplet notations", () => {
    const score = parse("L:1/4\nK:C jianpu\n| (3 1 2 3 |");
    const xml = toMusicXml(score);

    expect(xml).toContain("<duration>320</duration>");
    expect(xml).toContain("<actual-notes>3</actual-notes>");
    expect(xml).toContain("<normal-notes>2</normal-notes>");
    expect(xml).toContain("<tuplet type=\"start\" />");
    expect(xml).toContain("<tuplet type=\"stop\" />");
  });

  it("exports ties to MusicXML tie and tied elements", () => {
    const score = parse("K:C jianpu\n| 1~ | ~1 |");
    const xml = toMusicXml(score);

    expect(xml).toContain("<tie type=\"start\" />");
    expect(xml).toContain("<tie type=\"stop\" />");
    expect(xml).toContain("<tied type=\"start\" />");
    expect(xml).toContain("<tied type=\"stop\" />");
  });

  it("exports repeat, final, double barlines, and endings", () => {
    const score = parse("K:C jianpu\n|: 1 :| [1 2 || [2 3 |]");
    const xml = toMusicXml(score);

    expect(xml).toContain("<bar-style>heavy-light</bar-style>");
    expect(xml).toContain("<repeat direction=\"forward\" />");
    expect(xml).toContain("<repeat direction=\"backward\" />");
    expect(xml).toContain("<ending number=\"1\" type=\"start\">1</ending>");
    expect(xml).toContain("<bar-style>light-light</bar-style>");
    expect(xml).toContain("<ending number=\"2\" type=\"start\">2</ending>");
    expect(xml).toContain("<bar-style>light-heavy</bar-style>");
  });

  it("exports multiple voices as multiple MusicXML parts", () => {
    const score = parse(`T:双声部\nK:C jianpu\nV:melody\n| 1 2 |\nV:bass\n| 1, 5, |`);
    const xml = toMusicXml(score);

    expect(xml).toContain("<score-part id=\"P1\"><part-name>melody</part-name></score-part>");
    expect(xml).toContain("<score-part id=\"P2\"><part-name>bass</part-name></score-part>");
    expect(xml).toContain("<part id=\"P1\">");
    expect(xml).toContain("<part id=\"P2\">");
    expect(xml).toContain("<octave>3</octave>");
  });

  it("reports orphan extensions", () => {
    const score = parse("K:C jianpu\n| - 1 |");

    expect(() => toMusicXml(score)).toThrowError(MusicXmlExportError);
    try {
      toMusicXml(score);
    } catch (error) {
      expect(error).toMatchObject({ code: "ORPHAN_EXTENSION" });
    }
  });

  it("requires a key", () => {
    const score = parse("| 1 2 |");

    expect(() => toMusicXml(score)).toThrow(/without a JABC K: field/);
  });
});
