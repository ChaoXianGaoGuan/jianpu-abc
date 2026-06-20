import type { Fraction, Measure, MusicalEvent, NoteEvent, Score, Tempo, Voice } from "../core/ast";
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
  const key = score.header.key;
  if (!key) {
    throw new PlaybackBuildError("MISSING_KEY", "Cannot build playback events without a JABC K: field.");
  }

  const tempo = score.header.tempo ?? options.defaultTempo ?? DEFAULT_TEMPO;
  validateTempo(tempo);
  const velocity = options.velocity ?? 96;
  if (!Number.isInteger(velocity) || velocity < 0 || velocity > 127) {
    throw new RangeError("Playback velocity must be an integer from 0 to 127.");
  }

  const output = score.voices.flatMap((voice) => buildVoiceEvents(score, voice, tempo, velocity));
  return output
    .sort((left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id))
    .map((event, index) => ({ ...event, id: `playback-${index + 1}` }));
}

function buildVoiceEvents(
  score: Score,
  voice: Voice,
  tempo: Tempo,
  velocity: number,
): PlaybackEvent[] {
  const key = score.header.key;
  if (!key) {
    throw new PlaybackBuildError("MISSING_KEY", "Cannot build playback events without a JABC K: field.");
  }

  const output: PlaybackEvent[] = [];
  let currentKey = key;
  let cursor = 0;
  let pendingTie: { event: PlaybackEvent; midi: number } | undefined;
  let previousMeasureIndex: number | undefined;

  for (const measureIndex of expandMeasureOrder(voice.measures)) {
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

  return output;
}

export function expandMeasureOrder(measures: Measure[]): number[] {
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
