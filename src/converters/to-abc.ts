import type { Fraction, JianpuKey, Measure, NoteEvent, Score, Tuplet, Voice } from "../core/ast";
import { DEFAULT_NOTE_LENGTH, reduceFraction } from "../core/fraction";
import { degreeToPitch, toAbcPitchToken } from "../core/pitch";

export type AbcExportErrorCode =
  | "MISSING_KEY"
  | "ORPHAN_EXTENSION"
  | "UNSUPPORTED_PITCH";

export class AbcExportError extends Error {
  readonly code: AbcExportErrorCode;

  constructor(code: AbcExportErrorCode, message: string) {
    super(message);
    this.name = "AbcExportError";
    this.code = code;
  }
}

interface RenderableEvent {
  kind: "note" | "rest";
  token: string;
  duration: Fraction;
  tieStart?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  tuplet?: Tuplet;
}

interface RenderedToken {
  token: string;
  event?: RenderableEvent;
  startTime?: Fraction;
}

interface RenderMeasureResult {
  text: string;
  key: JianpuKey;
}

export function toStandardAbc(score: Score): string {
  const key = score.header.key;
  if (!key) {
    throw new AbcExportError("MISSING_KEY", "Cannot export ABC without a JABC K: field.");
  }

  const defaultLength = score.header.defaultNoteLength ?? DEFAULT_NOTE_LENGTH;
  const beatDuration = score.header.meter
    ? { numerator: 1, denominator: score.header.meter.denominator }
    : defaultLength;
  const headers = buildHeaders(score, defaultLength);
  const body = renderVoices(score, defaultLength, beatDuration);
  return [...headers, ...body].join("\n") + "\n";
}

function buildHeaders(score: Score, defaultLength: Fraction): string[] {
  const { header } = score;
  const lines = [`X:${header.index ?? "1"}`];
  if (header.title !== undefined) lines.push(`T:${header.title}`);
  if (header.composer !== undefined) lines.push(`C:${header.composer}`);
  if (header.meter) lines.push(`M:${formatFraction(header.meter)}`);
  lines.push(`L:${formatFraction(defaultLength)}`);
  if (header.tempo) {
    lines.push(`Q:${formatFraction(header.tempo.beat)}=${header.tempo.bpm}`);
  }

  if (score.voices.length > 1) {
    for (const voice of score.voices) lines.push(`V:${voice.id}`);
  }

  lines.push(`K:${header.key?.tonic ?? "C"}`);
  return lines;
}

function renderVoices(
  score: Score,
  defaultLength: Fraction,
  beatDuration: Fraction,
): string[] {
  const key = score.header.key;
  if (!key) throw new AbcExportError("MISSING_KEY", "Cannot export ABC without a JABC K: field.");
  const includeVoiceMarkers = score.voices.length > 1;
  const output: string[] = [];

  for (const voice of score.voices) {
    if (includeVoiceMarkers) output.push(`V:${voice.id}`);
    output.push(renderBody(voice, key, defaultLength, beatDuration));
    output.push(...renderLyrics(voice));
  }

  return output;
}

function renderBody(
  voice: Voice,
  initialKey: JianpuKey,
  defaultLength: Fraction,
  beatDuration: Fraction,
): string {
  if (voice.measures.length === 0) return "|";

  const measures: string[] = [];
  let currentKey = initialKey;
  for (const [index, measure] of voice.measures.entries()) {
    const rendered = renderMeasureWithBars(measure, index, currentKey, defaultLength, beatDuration);
    measures.push(rendered.text);
    currentKey = rendered.key;
  }

  const systems: string[] = [];
  let currentSystem: string[] = [];
  for (const [index, rendered] of measures.entries()) {
    currentSystem.push(rendered);
    if (voice.measures[index]?.systemBreakAfter) {
      systems.push(formatSystem(currentSystem, systems.length > 0));
      currentSystem = [];
    }
  }
  if (currentSystem.length > 0) {
    systems.push(formatSystem(currentSystem, systems.length > 0));
  }
  return systems.join("\n");
}

function formatSystem(measures: string[], continuation: boolean): string {
  const system = measures.join(" ").trimEnd();
  return continuation && !/^(?:\||\[|:)/.test(system) ? `| ${system}` : system;
}

function renderMeasureWithBars(
  measure: Measure,
  measureIndex: number,
  key: JianpuKey,
  defaultLength: Fraction,
  beatDuration: Fraction,
): RenderMeasureResult {
  const rendered = renderMeasure(measure, measureIndex, key, defaultLength, beatDuration);
  const left = measure.leftBarline?.sourceText ?? (measureIndex === 0 ? "|" : "");
  const ending = measure.ending?.sourceText ?? "";
  const right = measure.barline?.sourceText ?? "";
  return {
    text: [left, ending, rendered.text, right].filter((part) => part !== "").join(" "),
    key: rendered.key,
  };
}

function renderMeasure(
  measure: Measure,
  measureIndex: number,
  initialKey: JianpuKey,
  defaultLength: Fraction,
  beatDuration: Fraction,
): RenderMeasureResult {
  const tokens: RenderedToken[] = [];
  let currentKey = initialKey;
  let previousRenderable: RenderableEvent | undefined;
  let elapsed: Fraction = { numerator: 0, denominator: 1 };

  for (const event of measure.events) {
    if (event.type === "key-change") {
      currentKey = event.key;
      tokens.push({ token: `[K:${event.key.tonic}]` });
      continue;
    }

    if (event.type === "extension") {
      if (!previousRenderable || previousRenderable.kind !== "note") {
        const location = event.location
          ? ` at line ${event.location.line}, column ${event.location.column}`
          : ` in measure ${measureIndex + 1}`;
        throw new AbcExportError(
          "ORPHAN_EXTENSION",
          `Extension "-" must follow a note${location}.`,
        );
      }
      previousRenderable.duration = addFractions(previousRenderable.duration, event.duration);
      elapsed = addFractions(elapsed, event.duration);
      continue;
    }

    const renderable: RenderableEvent = event.type === "rest"
      ? {
        kind: "rest",
        token: "z",
        duration: { ...event.duration },
        ...(event.tuplet ? { tuplet: event.tuplet } : {}),
      }
      : {
        kind: "note",
        token: renderNote(event, currentKey),
        duration: { ...event.duration },
        ...(event.tieStart ? { tieStart: true } : {}),
        ...(event.slurStart ? { slurStart: true } : {}),
        ...(event.slurEnd ? { slurEnd: true } : {}),
        ...(event.tuplet ? { tuplet: event.tuplet } : {}),
      };
    tokens.push({ event: renderable, startTime: elapsed, token: "" });
    previousRenderable = renderable;
    elapsed = addFractions(elapsed, event.duration);
  }

  const formatted = tokens.map((entry) => ({
    ...entry,
    token: entry.event ? renderToken(entry.event, defaultLength) : entry.token,
  }));

  return {
    text: formatted.map((entry, index) => {
      if (index === 0) return entry.token;
      const previous = formatted[index - 1] as RenderedToken;
      const join = previous.event !== undefined
        && entry.event !== undefined
        && previous.startTime !== undefined
        && entry.startTime !== undefined
        ? shouldBeamTogether(previous.event, entry.event, previous.startTime, entry.startTime, beatDuration)
        : false;
      return `${join ? "" : " "}${entry.token}`;
    }).join(""),
    key: currentKey,
  };
}

function renderToken(event: RenderableEvent, defaultLength: Fraction): string {
  const tupletPrefix = event.tuplet?.position === "start" ? `(${event.tuplet.actual}` : "";
  const duration = notationDuration(event);
  const slurPrefix = event.slurStart ? "(" : "";
  const slurSuffix = event.slurEnd ? ")" : "";
  return `${tupletPrefix}${slurPrefix}${event.token}${durationSuffix(duration, defaultLength)}${event.tieStart ? "-" : ""}${slurSuffix}`;
}

function shouldBeamTogether(
  previous: RenderableEvent,
  current: RenderableEvent,
  previousStart: Fraction,
  currentStart: Fraction,
  beatDuration: Fraction,
): boolean {
  if (previous.kind !== "note" || current.kind !== "note") return false;
  const previousDuration = notationDuration(previous);
  const currentDuration = notationDuration(current);
  if (!equalFractions(previousDuration, currentDuration)) return false;
  if (compareFractions(previousDuration, beatDuration) >= 0) return false;
  return beatIndex(previousStart, beatDuration) === beatIndex(currentStart, beatDuration);
}

function notationDuration(event: RenderableEvent): Fraction {
  return event.tuplet
    ? reduceFraction({
      numerator: event.duration.numerator * event.tuplet.actual,
      denominator: event.duration.denominator * event.tuplet.normal,
    })
    : event.duration;
}

function renderNote(
  note: NoteEvent,
  key: JianpuKey,
): string {
  try {
    const pitch = degreeToPitch({
      key,
      degree: note.degree,
      ...(note.accidental === undefined ? {} : { accidental: note.accidental }),
      octaveShift: note.octaveShift,
    });

    if (note.accidental === undefined) {
      return toAbcPitchToken({ step: pitch.step, alter: 0, octave: pitch.octave });
    }
    return toAbcPitchToken(pitch, pitch.alter === 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AbcExportError("UNSUPPORTED_PITCH", message);
  }
}

function renderLyrics(voice: Voice): string[] {
  if (voice.lyricLines.length > 0) {
    return voice.lyricLines.map((line) => `w: ${line.text}`);
  }

  const notes = voice.measures.flatMap((measure) =>
    measure.events.filter((event): event is NoteEvent => event.type === "note")
  );
  if (!notes.some((note) => note.lyric !== undefined)) return [];
  return [`w: ${notes.map((note) => note.lyric ?? "*").join(" ")}`];
}

function durationSuffix(duration: Fraction, defaultLength: Fraction): string {
  const ratio = reduceFraction({
    numerator: duration.numerator * defaultLength.denominator,
    denominator: duration.denominator * defaultLength.numerator,
  });
  if (ratio.numerator === ratio.denominator) return "";
  if (ratio.denominator === 1) return String(ratio.numerator);
  return `${ratio.numerator}/${ratio.denominator}`;
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}

function compareFractions(left: Fraction, right: Fraction): number {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

function equalFractions(left: Fraction, right: Fraction): boolean {
  return compareFractions(left, right) === 0;
}

function beatIndex(startTime: Fraction, beatDuration: Fraction): number {
  return Math.floor(
    (startTime.numerator * beatDuration.denominator)
    / (startTime.denominator * beatDuration.numerator),
  );
}

function formatFraction(value: Fraction): string {
  return `${value.numerator}/${value.denominator}`;
}
