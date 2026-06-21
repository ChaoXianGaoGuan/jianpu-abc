import type {
  Fraction,
  Measure,
  MusicalEvent,
  NoteEvent,
  RepeatMarkerEvent,
  RepeatMarkerKind,
  Score,
  Tempo,
  TimeSignature,
  Voice,
} from "../core/ast";
import { degreeToPitch } from "../core/pitch";

export interface PlaybackEvent {
  id: string;
  type: "note";
  midi: number;
  startTime: number;
  duration: number;
  velocity: number;
  sourceEventId?: string;
}

export interface PlaybackOptions {
  velocity?: number;
  defaultTempo?: Tempo;
}

export interface PlaybackPlanOptions extends PlaybackOptions {
  defaultMeter?: TimeSignature;
}

export interface MetronomeEvent {
  startTime: number;
  accent: boolean;
}

export interface PlaybackPlan {
  events: PlaybackEvent[];
  metronomeEvents: MetronomeEvent[];
  duration: number;
  meter: TimeSignature;
  tempo: Tempo;
}

interface VoicePlaybackTimeline {
  events: PlaybackEvent[];
  duration: number;
}

export type PlaybackBuildErrorCode =
  | "MISSING_KEY"
  | "INVALID_TEMPO"
  | "INVALID_DURATION"
  | "ORPHAN_EXTENSION"
  | "UNMATCHED_TIE"
  | "TIE_PITCH_MISMATCH"
  | "UNSUPPORTED_PITCH";

export class PlaybackBuildError extends Error {
  readonly code: PlaybackBuildErrorCode;

  constructor(code: PlaybackBuildErrorCode, message: string) {
    super(message);
    this.name = "PlaybackBuildError";
    this.code = code;
  }
}

const DEFAULT_TEMPO: Tempo = {
  beat: { numerator: 1, denominator: 4 },
  bpm: 120,
};

export function scoreToPlaybackEvents(
  score: Score,
  options: PlaybackOptions = {},
): PlaybackEvent[] {
  return scoreToPlaybackPlan(score, options).events;
}

export function scoreToPlaybackPlan(
  score: Score,
  options: PlaybackPlanOptions = {},
): PlaybackPlan {
  const key = score.header.key;
  if (!key) {
    throw new PlaybackBuildError("MISSING_KEY", "Cannot build playback events without a JABC K: field.");
  }

  const tempo = score.header.tempo ?? options.defaultTempo ?? DEFAULT_TEMPO;
  const meter = score.header.meter ?? options.defaultMeter ?? { numerator: 4, denominator: 4 };
  validateTempo(tempo);
  validateMeter(meter);
  const velocity = options.velocity ?? 96;
  if (!Number.isInteger(velocity) || velocity < 0 || velocity > 127) {
    throw new RangeError("Playback velocity must be an integer from 0 to 127.");
  }

  const structuralVoice = score.voices.find((voice) => voice.measures.length > 0);
  const measureOrder = structuralVoice ? expandMeasureOrder(structuralVoice.measures) : [];
  const timelines = score.voices.map((voice) => buildVoiceEvents(score, voice, tempo, velocity, measureOrder));
  const events = timelines.flatMap((timeline) => timeline.events)
    .sort((left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id))
    .map((event, index) => ({ ...event, id: `playback-${index + 1}` }));
  const metronomeTimeline = structuralVoice
    ? buildMetronomeEvents(structuralVoice, tempo, meter, measureOrder)
    : { events: [], duration: 0 };
  return {
    events,
    metronomeEvents: metronomeTimeline.events,
    duration: Math.max(
      metronomeTimeline.duration,
      ...timelines.map((timeline) => timeline.duration),
      0,
    ),
    meter,
    tempo,
  };
}

export function prependCountIn(plan: PlaybackPlan, measures = 1): PlaybackPlan {
  if (!Number.isInteger(measures) || measures < 0) {
    throw new RangeError("Count-in measures must be a non-negative integer.");
  }
  validateTempo(plan.tempo);
  validateMeter(plan.meter);

  const measureDuration = durationToSeconds({
    numerator: plan.meter.numerator,
    denominator: plan.meter.denominator,
  }, plan.tempo);
  const pulseDuration = durationToSeconds(metronomePulse(plan.meter), plan.tempo);
  const countInDuration = measureDuration * measures;
  const countInEvents: MetronomeEvent[] = [];

  for (let measure = 0; measure < measures; measure += 1) {
    const measureStart = measure * measureDuration;
    for (let offset = 0; offset < measureDuration - 1e-9; offset += pulseDuration) {
      countInEvents.push({ startTime: measureStart + offset, accent: offset === 0 });
    }
  }

  return {
    events: plan.events.map((event) => ({
      ...event,
      startTime: event.startTime + countInDuration,
    })),
    metronomeEvents: [
      ...countInEvents,
      ...plan.metronomeEvents.map((event) => ({
        ...event,
        startTime: event.startTime + countInDuration,
      })),
    ],
    duration: plan.duration + countInDuration,
    meter: { ...plan.meter },
    tempo: { ...plan.tempo, beat: { ...plan.tempo.beat } },
  };
}

function buildVoiceEvents(
  score: Score,
  voice: Voice,
  tempo: Tempo,
  velocity: number,
  measureOrder: number[],
): VoicePlaybackTimeline {
  const key = score.header.key;
  if (!key) {
    throw new PlaybackBuildError("MISSING_KEY", "Cannot build playback events without a JABC K: field.");
  }

  const output: PlaybackEvent[] = [];
  let currentKey = key;
  let cursor = 0;
  let pendingTie: { event: PlaybackEvent; midi: number } | undefined;
  let previousMeasureIndex: number | undefined;

  for (const measureIndex of measureOrder) {
    const measure = voice.measures[measureIndex];
    if (!measure) continue;
    let extendable: PlaybackEvent | undefined;
    let mayResetTieAtBranch = previousMeasureIndex !== undefined
      && measureIndex !== previousMeasureIndex + 1;
    previousMeasureIndex = measureIndex;

    for (const [eventIndex, event] of measure.events.entries()) {
      const sourceEventId = `${voice.id}:${measureIndex}:${eventIndex}`;
      if (event.type === "key-change") {
        currentKey = event.key;
        continue;
      }
      if (event.type === "repeat-marker") continue;
      const duration = durationToSeconds(event.duration, tempo);

      if (event.type === "extension") {
        if (!extendable) {
          throw playbackEventError(
            "ORPHAN_EXTENSION",
            event,
            `Extension "-" must follow a note in voice ${voice.id}, measure ${measureIndex + 1}.`,
          );
        }
        extendable.duration += duration;
        cursor += duration;
        continue;
      }

      if (event.type === "rest") {
        if (pendingTie && mayResetTieAtBranch) pendingTie = undefined;
        mayResetTieAtBranch = false;
        if (pendingTie) {
          throw playbackEventError(
            "UNMATCHED_TIE",
            event,
            `A rest cannot occur before an open tie is completed in voice ${voice.id}.`,
          );
        }
        extendable = undefined;
        cursor += duration;
        continue;
      }

      const midi = resolveMidi(event, currentKey);
      if (pendingTie && mayResetTieAtBranch && !event.tieEnd) pendingTie = undefined;
      mayResetTieAtBranch = false;
      if (event.tieEnd) {
        if (!pendingTie) {
          throw playbackEventError(
            "UNMATCHED_TIE",
            event,
            `tieEnd must follow a note with tieStart in voice ${voice.id}.`,
          );
        }
        if (pendingTie.midi !== midi) {
          throw playbackEventError(
            "TIE_PITCH_MISMATCH",
            event,
            `Tied notes must have the same MIDI pitch; received ${pendingTie.midi} and ${midi}.`,
          );
        }

        pendingTie.event.duration += duration;
        extendable = pendingTie.event;
        if (!event.tieStart) pendingTie = undefined;
      } else {
        if (pendingTie) {
          throw playbackEventError(
            "UNMATCHED_TIE",
            event,
            `A note with tieStart must be followed by a note with tieEnd in voice ${voice.id}.`,
          );
        }

        const playbackEvent: PlaybackEvent = {
          id: `${voice.id}-${output.length + 1}`,
          type: "note",
          midi,
          startTime: cursor,
          duration,
          velocity,
          sourceEventId,
        };
        output.push(playbackEvent);
        extendable = playbackEvent;
        if (event.tieStart) pendingTie = { event: playbackEvent, midi };
      }

      cursor += duration;
    }
  }

  if (pendingTie) {
    throw new PlaybackBuildError(
      "UNMATCHED_TIE",
      `Voice ${voice.id} ends before the final tieStart is completed.`,
    );
  }

  return { events: output, duration: cursor };
}

function buildMetronomeEvents(
  voice: Voice,
  tempo: Tempo,
  meter: TimeSignature,
  measureOrder: number[],
): { events: MetronomeEvent[]; duration: number } {
  const events: MetronomeEvent[] = [];
  const pulseSeconds = durationToSeconds(metronomePulse(meter), tempo);
  let cursor = 0;

  for (const measureIndex of measureOrder) {
    const measure = voice.measures[measureIndex];
    if (!measure) continue;
    const measureDuration = measure.events.reduce((total, event) =>
      event.type === "key-change" || event.type === "repeat-marker" ? total : total + durationToSeconds(event.duration, tempo), 0);
    for (let offset = 0; offset < measureDuration - 1e-9; offset += pulseSeconds) {
      events.push({ startTime: cursor + offset, accent: offset === 0 });
    }
    cursor += measureDuration;
  }

  return { events, duration: cursor };
}

function metronomePulse(meter: TimeSignature): Fraction {
  if (meter.denominator === 8 && [6, 9, 12].includes(meter.numerator)) {
    return { numerator: 3, denominator: 8 };
  }
  return { numerator: 1, denominator: meter.denominator };
}

export function expandMeasureOrder(measures: Measure[]): number[] {
  return expandRepeatNavigationOrder(measures, expandLocalRepeatOrder(measures));
}

function expandLocalRepeatOrder(measures: Measure[]): number[] {
  const output: number[] = [];
  let repeatStart = 0;

  for (let index = 0; index < measures.length; index += 1) {
    const measure = measures[index];
    if (!measure) continue;
    if (measure.leftBarline?.type === "repeat-start") repeatStart = index;

    output.push(index);

    if (measure.barline?.type === "repeat-end") {
      const firstEndingStart = findFirstEndingStart(measures, repeatStart, index);
      const repeatEndExclusive = firstEndingStart === -1 ? index + 1 : firstEndingStart;
      for (let repeated = repeatStart; repeated < repeatEndExclusive; repeated += 1) {
        output.push(repeated);
      }
      repeatStart = index + 1;
    }
  }

  return output;
}

function expandRepeatNavigationOrder(measures: Measure[], baseOrder: number[]): number[] {
  const directive = firstDirectiveMeasure(measures, baseOrder);
  if (!directive) return baseOrder;

  const firstPass = baseOrder.slice(0, directive.orderIndex + 1);
  const target = directive.kind === "ds" ? firstMarkerMeasure(measures, "segno") ?? 0 : 0;
  const codaMeasures = markerMeasures(measures, "coda");
  const codaJump = codaMeasures.find((index) => index >= target && index <= directive.measureIndex);
  const codaDestination = codaJump === undefined
    ? undefined
    : codaMeasures.find((index) => index > directive.measureIndex) ?? codaMeasures.find((index) => index > codaJump);
  if (codaJump !== undefined && codaDestination !== undefined) {
    return [
      ...firstPass,
      ...measureRange(target, repeatNavigationEnd(measures, codaJump)),
      ...measureRange(codaDestination, measures.length - 1),
    ];
  }

  const fine = firstMarkerMeasure(measures, "fine", target, directive.measureIndex);
  if (fine !== undefined) {
    return [...firstPass, ...measureRange(target, repeatNavigationEnd(measures, fine))];
  }

  return [...firstPass, ...measureRange(target, measures.length - 1)];
}

function firstDirectiveMeasure(
  measures: Measure[],
  order: number[],
): { measureIndex: number; orderIndex: number; kind: "dc" | "ds" } | undefined {
  for (const [orderIndex, measureIndex] of order.entries()) {
    const kind = firstMarkerKind(measures[measureIndex], ["dc", "dacapo", "ds"]);
    if (kind === "dc" || kind === "dacapo") return { measureIndex, orderIndex, kind: "dc" };
    if (kind === "ds") return { measureIndex, orderIndex, kind: "ds" };
  }
  return undefined;
}

function firstMarkerMeasure(
  measures: Measure[],
  kind: RepeatMarkerKind,
  start = 0,
  end = measures.length - 1,
): number | undefined {
  return markerMeasures(measures, kind).find((index) => index >= start && index <= end);
}

function markerMeasures(measures: Measure[], kind: RepeatMarkerKind): number[] {
  const output: number[] = [];
  for (const [index, measure] of measures.entries()) {
    if (firstMarkerKind(measure, [kind])) output.push(index);
  }
  return output;
}

function firstMarkerKind(measure: Measure | undefined, kinds: RepeatMarkerKind[]): RepeatMarkerKind | undefined {
  return measure?.events.find(
    (event): event is RepeatMarkerEvent => event.type === "repeat-marker" && kinds.includes(event.kind),
  )?.kind;
}

function repeatNavigationEnd(measures: Measure[], markerMeasureIndex: number): number {
  return markerIsAtMeasureStart(measures[markerMeasureIndex]) ? markerMeasureIndex - 1 : markerMeasureIndex;
}

function markerIsAtMeasureStart(measure: Measure | undefined): boolean {
  const firstEvent = measure?.events[0];
  return firstEvent?.type === "repeat-marker";
}

function measureRange(start: number, end: number): number[] {
  const output: number[] = [];
  for (let index = Math.max(0, start); index <= end; index += 1) output.push(index);
  return output;
}

function findFirstEndingStart(measures: Measure[], start: number, end: number): number {
  for (let index = start; index <= end; index += 1) {
    const number = measures[index]?.ending?.number;
    if (number === "1" || number?.split(",").map((value) => value.trim()).includes("1")) {
      return index;
    }
  }
  return -1;
}

function resolveMidi(note: NoteEvent, key: NonNullable<Score["header"]["key"]>): number {
  try {
    return degreeToPitch({
      key,
      degree: note.degree,
      ...(note.accidental === undefined ? {} : { accidental: note.accidental }),
      octaveShift: note.octaveShift,
    }).midi;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PlaybackBuildError("UNSUPPORTED_PITCH", message);
  }
}

function durationToSeconds(duration: Fraction, tempo: Tempo): number {
  validateFraction(duration, "Event duration");
  const durationInWholeNotes = duration.numerator / duration.denominator;
  const beatInWholeNotes = tempo.beat.numerator / tempo.beat.denominator;
  return (durationInWholeNotes / beatInWholeNotes) * (60 / tempo.bpm);
}

function validateTempo(tempo: Tempo): void {
  validateFraction(tempo.beat, "Tempo beat");
  if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0) {
    throw new PlaybackBuildError("INVALID_TEMPO", "Tempo BPM must be a positive number.");
  }
}

function validateMeter(meter: TimeSignature): void {
  if (
    !Number.isInteger(meter.numerator)
    || !Number.isInteger(meter.denominator)
    || meter.numerator <= 0
    || meter.denominator <= 0
  ) {
    throw new RangeError("Meter must use positive integer values.");
  }
}

function validateFraction(value: Fraction, label: string): void {
  if (
    !Number.isInteger(value.numerator)
    || !Number.isInteger(value.denominator)
    || value.numerator <= 0
    || value.denominator <= 0
  ) {
    throw new PlaybackBuildError(
      "INVALID_DURATION",
      `${label} must be a positive integer fraction.`,
    );
  }
}

function playbackEventError(
  code: PlaybackBuildErrorCode,
  event: MusicalEvent,
  message: string,
): PlaybackBuildError {
  const suffix = event.location
    ? ` Line ${event.location.line}, column ${event.location.column}.`
    : "";
  return new PlaybackBuildError(code, message + suffix);
}
