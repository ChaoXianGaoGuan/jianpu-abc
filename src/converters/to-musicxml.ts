import type { Barline, Ending, Fraction, Measure, NoteEvent, RestEvent, Score, Tempo, Voice } from "../core/ast";
import { DEFAULT_NOTE_LENGTH, reduceFraction } from "../core/fraction";
import { degreeToPitch, type MusicXmlPitch } from "../core/pitch";

export type MusicXmlExportErrorCode =
  | "MISSING_KEY"
  | "ORPHAN_EXTENSION"
  | "INVALID_DURATION"
  | "UNSUPPORTED_PITCH";

export class MusicXmlExportError extends Error {
  readonly code: MusicXmlExportErrorCode;

  constructor(code: MusicXmlExportErrorCode, message: string) {
    super(message);
    this.name = "MusicXmlExportError";
    this.code = code;
  }
}

interface RenderableNote {
  kind: "note";
  source: NoteEvent;
  duration: Fraction;
  pitch: MusicXmlPitch;
  accidentalName?: string;
}

interface RenderableRest {
  kind: "rest";
  source: RestEvent;
  duration: Fraction;
}

type RenderableEvent = RenderableNote | RenderableRest;

const DEFAULT_DIVISIONS = 480;
const MAJOR_KEY_FIFTHS: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "F#": 6,
  "C#": 7,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
};

export function toMusicXml(score: Score): string {
  const key = score.header.key;
  if (!key) {
    throw new MusicXmlExportError("MISSING_KEY", "Cannot export MusicXML without a JABC K: field.");
  }

  const divisions = chooseDivisions(score.voices);
  const title = score.header.title ?? "Untitled";
  const partList = score.voices.flatMap((voice, index) => renderScorePart(voice, index));
  const parts = score.voices.map((voice, index) => renderPart(score, voice, index, divisions));

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 4.0 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">",
    "<score-partwise version=\"4.0\">",
    `  <work><work-title>${escapeXml(title)}</work-title></work>`,
    score.header.composer === undefined
      ? undefined
      : `  <identification><creator type=\"composer\">${escapeXml(score.header.composer)}</creator></identification>`,
    "  <part-list>",
    ...partList,
    "  </part-list>",
    ...parts,
    "</score-partwise>",
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

function renderScorePart(voice: Voice, index: number): string[] {
  const partId = partIdentifier(index);
  const name = voice.id === "default" ? "Music" : voice.id;
  return [`    <score-part id=\"${partId}\"><part-name>${escapeXml(name)}</part-name></score-part>`];
}

function renderPart(score: Score, voice: Voice, voiceIndex: number, divisions: number): string {
  const measures = voice.measures.map((measure, measureIndex) =>
    renderMeasure(score, measure, measureIndex, divisions)
  );
  return [
    `  <part id=\"${partIdentifier(voiceIndex)}\">`,
    ...measures,
    "  </part>",
  ].join("\n");
}

function renderMeasure(
  score: Score,
  measure: Measure,
  measureIndex: number,
  divisions: number,
): string {
  const renderable = toRenderableEvents(score, measure, measureIndex);
  const lines = [`    <measure number=\"${measureIndex + 1}\">`];

  if (measureIndex === 0) {
    lines.push(...renderAttributes(score, divisions));
    if (score.header.tempo) lines.push(...renderTempo(score.header.tempo));
  }

  if (measure.leftBarline) {
    lines.push(...renderMusicXmlBarline(measure.leftBarline, "left", measure.ending));
  } else if (measure.ending) {
    lines.push(...renderMusicXmlBarline(undefined, "left", measure.ending));
  }

  for (const event of renderable) {
    lines.push(...renderNoteElement(event, divisions));
  }

  if (measure.barline) {
    lines.push(...renderMusicXmlBarline(measure.barline, "right"));
  }

  lines.push("    </measure>");
  return lines.join("\n");
}

function renderMusicXmlBarline(
  barline: Barline | undefined,
  location: "left" | "right",
  ending?: Ending,
): string[] {
  const lines = [`      <barline location=\"${location}\">`];
  const style = barlineStyle(barline);
  if (style) lines.push(`        <bar-style>${style}</bar-style>`);
  if (ending) lines.push(`        <ending number=\"${escapeXml(ending.number)}\" type=\"start\">${escapeXml(ending.number)}</ending>`);
  if (barline?.type === "repeat-start") lines.push("        <repeat direction=\"forward\" />");
  if (barline?.type === "repeat-end") lines.push("        <repeat direction=\"backward\" />");
  lines.push("      </barline>");
  return lines;
}

function barlineStyle(barline: Barline | undefined): string | undefined {
  if (!barline) return undefined;
  if (barline.type === "single") return "regular";
  if (barline.type === "double") return "light-light";
  if (barline.type === "final" || barline.type === "repeat-end") return "light-heavy";
  if (barline.type === "start" || barline.type === "repeat-start") return "heavy-light";
  return undefined;
}

function renderAttributes(score: Score, divisions: number): string[] {
  const header = score.header;
  const fifths = header.key ? (MAJOR_KEY_FIFTHS[header.key.tonic] ?? 0) : 0;
  const meter = header.meter ?? { numerator: 4, denominator: 4 };

  return [
    "      <attributes>",
    `        <divisions>${divisions}</divisions>`,
    "        <key>",
    `          <fifths>${fifths}</fifths>`,
    "        </key>",
    "        <time>",
    `          <beats>${meter.numerator}</beats>`,
    `          <beat-type>${meter.denominator}</beat-type>`,
    "        </time>",
    "        <clef>",
    "          <sign>G</sign>",
    "          <line>2</line>",
    "        </clef>",
    "      </attributes>",
  ];
}

function renderTempo(tempo: Tempo): string[] {
  return [
    "      <direction placement=\"above\">",
    "        <direction-type>",
    "          <metronome parentheses=\"no\">",
    `            <beat-unit>${beatUnit(tempo.beat)}</beat-unit>`,
    `            <per-minute>${tempo.bpm}</per-minute>`,
    "          </metronome>",
    "        </direction-type>",
    `        <sound tempo=\"${tempo.bpm}\" />`,
    "      </direction>",
  ];
}

function toRenderableEvents(score: Score, measure: Measure, measureIndex: number): RenderableEvent[] {
  const key = score.header.key;
  if (!key) throw new MusicXmlExportError("MISSING_KEY", "Cannot export MusicXML without a JABC K: field.");

  const rendered: RenderableEvent[] = [];
  for (const event of measure.events) {
    if (event.type === "extension") {
      const previous = rendered.at(-1);
      if (!previous || previous.kind !== "note") {
        const location = event.location
          ? ` at line ${event.location.line}, column ${event.location.column}`
          : ` in measure ${measureIndex + 1}`;
        throw new MusicXmlExportError(
          "ORPHAN_EXTENSION",
          `Extension "-" must follow a note${location}.`,
        );
      }
      previous.duration = addFractions(previous.duration, event.duration);
      continue;
    }

    if (event.type === "rest") {
      rendered.push({ kind: "rest", source: event, duration: { ...event.duration } });
      continue;
    }

    try {
      const pitch = degreeToPitch({
        key,
        degree: event.degree,
        ...(event.accidental === undefined ? {} : { accidental: event.accidental }),
        octaveShift: event.octaveShift,
      });
      rendered.push({
        kind: "note",
        source: event,
        duration: { ...event.duration },
        pitch: pitch.musicXml,
        ...(event.accidental === undefined ? {} : { accidentalName: accidentalName(pitch.alter ?? 0, event.accidental) }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MusicXmlExportError("UNSUPPORTED_PITCH", message);
    }
  }
  return rendered;
}

function renderNoteElement(event: RenderableEvent, divisions: number): string[] {
  const duration = durationToDivisions(event.duration, divisions);
  const lines = ["      <note>"];
  if (event.kind === "rest") {
    lines.push("        <rest />");
  } else {
    lines.push("        <pitch>");
    lines.push(`          <step>${event.pitch.step}</step>`);
    if (event.pitch.alter !== undefined) lines.push(`          <alter>${event.pitch.alter}</alter>`);
    lines.push(`          <octave>${event.pitch.octave}</octave>`);
    lines.push("        </pitch>");
  }

  lines.push(`        <duration>${duration}</duration>`);
  if (event.kind === "note" && event.source.tieEnd) lines.push("        <tie type=\"stop\" />");
  if (event.kind === "note" && event.source.tieStart) lines.push("        <tie type=\"start\" />");
  lines.push("        <voice>1</voice>");
  const noteType = noteTypeName(event.duration);
  if (noteType) lines.push(`        <type>${noteType}</type>`);
  if (event.source.tuplet) {
    lines.push("        <time-modification>");
    lines.push(`          <actual-notes>${event.source.tuplet.actual}</actual-notes>`);
    lines.push(`          <normal-notes>${event.source.tuplet.normal}</normal-notes>`);
    lines.push("        </time-modification>");
  }
  const dots = event.kind === "note" ? event.source.dots : event.source.dots;
  for (let index = 0; index < (dots ?? 0); index += 1) lines.push("        <dot />");
  if (event.kind === "note" && event.accidentalName) {
    lines.push(`        <accidental>${event.accidentalName}</accidental>`);
  }
  const hasTiedNotation = event.kind === "note" && (event.source.tieStart || event.source.tieEnd);
  const hasSlurNotation = event.kind === "note" && (event.source.slurStart || event.source.slurEnd);
  const hasTupletNotation = event.source.tuplet?.position === "start" || event.source.tuplet?.position === "end";
  if (hasTiedNotation || hasSlurNotation || hasTupletNotation) {
    lines.push("        <notations>");
    if (event.kind === "note" && event.source.tieEnd) lines.push("          <tied type=\"stop\" />");
    if (event.kind === "note" && event.source.tieStart) lines.push("          <tied type=\"start\" />");
    if (event.kind === "note" && event.source.slurEnd) lines.push("          <slur type=\"stop\" />");
    if (event.kind === "note" && event.source.slurStart) lines.push("          <slur type=\"start\" />");
    if (event.source.tuplet?.position === "start") lines.push("          <tuplet type=\"start\" />");
    if (event.source.tuplet?.position === "end") lines.push("          <tuplet type=\"stop\" />");
    lines.push("        </notations>");
  }
  if (event.kind === "note" && event.source.lyric) {
    lines.push("        <lyric>");
    lines.push(`          <text>${escapeXml(event.source.lyric)}</text>`);
    lines.push("        </lyric>");
  }
  lines.push("      </note>");
  return lines;
}

function chooseDivisions(voices: Voice[]): number {
  let divisions = DEFAULT_DIVISIONS;
  for (const voice of voices) {
    for (const measure of voice.measures) {
      for (const event of measure.events) {
        const quarterDuration = reduceFraction({
          numerator: event.duration.numerator * 4,
          denominator: event.duration.denominator,
        });
        divisions = lcm(divisions, quarterDuration.denominator);
      }
    }
  }
  return divisions;
}

function durationToDivisions(duration: Fraction, divisions: number): number {
  validateFraction(duration);
  const quarterDuration = reduceFraction({
    numerator: duration.numerator * 4 * divisions,
    denominator: duration.denominator,
  });
  if (quarterDuration.denominator !== 1) {
    throw new MusicXmlExportError(
      "INVALID_DURATION",
      `Duration ${duration.numerator}/${duration.denominator} cannot be represented with divisions=${divisions}.`,
    );
  }
  return quarterDuration.numerator;
}

function noteTypeName(duration: Fraction): string | undefined {
  const base = undottedDuration(duration);
  const names: Record<string, string> = {
    "1/1": "whole",
    "1/2": "half",
    "1/4": "quarter",
    "1/8": "eighth",
    "1/16": "16th",
    "1/32": "32nd",
    "1/64": "64th",
  };
  return names[`${base.numerator}/${base.denominator}`];
}

function undottedDuration(duration: Fraction): Fraction {
  const candidates = [
    { factor: { numerator: 7, denominator: 4 } },
    { factor: { numerator: 3, denominator: 2 } },
  ];
  for (const candidate of candidates) {
    const value = reduceFraction({
      numerator: duration.numerator * candidate.factor.denominator,
      denominator: duration.denominator * candidate.factor.numerator,
    });
    if ([1, 2, 4, 8, 16, 32, 64].includes(value.denominator) && value.numerator === 1) {
      return value;
    }
  }
  return reduceFraction(duration);
}

function accidentalName(alter: number, accidental: NonNullable<NoteEvent["accidental"]>): string {
  if (accidental === "natural") return "natural";
  if (alter === 2) return "double-sharp";
  if (alter === 1) return "sharp";
  if (alter === -1) return "flat";
  if (alter === -2) return "flat-flat";
  return "natural";
}

function beatUnit(beat: Fraction): string {
  const names: Record<number, string> = {
    1: "whole",
    2: "half",
    4: "quarter",
    8: "eighth",
    16: "16th",
    32: "32nd",
  };
  if (beat.numerator === 1 && names[beat.denominator]) return names[beat.denominator] as string;
  return "quarter";
}

function validateFraction(value: Fraction): void {
  if (
    !Number.isInteger(value.numerator)
    || !Number.isInteger(value.denominator)
    || value.numerator <= 0
    || value.denominator <= 0
  ) {
    throw new MusicXmlExportError("INVALID_DURATION", "MusicXML durations must be positive integer fractions.");
  }
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}

function partIdentifier(index: number): string {
  return `P${index + 1}`;
}

function lcm(left: number, right: number): number {
  return Math.abs(left * right) / gcd(left, right);
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
