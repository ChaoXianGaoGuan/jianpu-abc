import type { Accidental, JianpuKey, PitchClass } from "./ast";

export type PitchStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export interface MusicXmlPitch {
  step: PitchStep;
  alter?: number;
  octave: number;
}

export interface ResolvedPitch {
  name: string;
  pitchClass: string;
  step: PitchStep;
  alter: number;
  octave: number;
  midi: number;
  abc: string;
  musicXml: MusicXmlPitch;
}

export interface DegreeToPitchInput {
  key: JianpuKey;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  accidental?: Accidental;
  octaveShift?: number;
}

const STEPS: PitchStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_SEMITONES: Record<PitchStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const TONIC_SEMITONES: Record<PitchClass, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function degreeToPitch(input: DegreeToPitchInput): ResolvedPitch {
  if (input.key.mode && input.key.mode !== "major") {
    throw new RangeError(`Unsupported mode "${input.key.mode}". Milestone 2 supports major keys only.`);
  }

  const octaveShift = input.octaveShift ?? 0;
  if (!Number.isInteger(octaveShift)) {
    throw new RangeError("octaveShift must be an integer.");
  }

  const degreeIndex = input.degree - 1;
  const interval = MAJOR_INTERVALS[degreeIndex];
  if (interval === undefined) {
    throw new RangeError(`Degree must be between 1 and 7; received ${String(input.degree)}.`);
  }

  const tonicStep = input.key.tonic[0] as PitchStep;
  const tonicStepIndex = STEPS.indexOf(tonicStep);
  const absoluteStepIndex = tonicStepIndex + degreeIndex;
  const step = STEPS[absoluteStepIndex % STEPS.length] as PitchStep;
  const octave = 4 + Math.floor(absoluteStepIndex / STEPS.length) + octaveShift;
  const naturalMidi = (octave + 1) * 12 + NATURAL_SEMITONES[step];
  const scaleMidi = 60 + TONIC_SEMITONES[input.key.tonic] + interval + octaveShift * 12;
  const scaleAlter = scaleMidi - naturalMidi;
  const alter = resolveAlter(scaleAlter, input.accidental);

  if (Math.abs(alter) > 2) {
    throw new RangeError(`The resolved accidental ${alter} is outside the supported double-accidental range.`);
  }

  const midi = naturalMidi + alter;
  if (midi < 0 || midi > 127) {
    throw new RangeError(`The resolved MIDI pitch ${midi} is outside the range 0-127.`);
  }

  const pitchClass = `${step}${accidentalSuffix(alter)}`;
  const musicXml: MusicXmlPitch = alter === 0
    ? { step, octave }
    : { step, alter, octave };

  return {
    name: `${pitchClass}${octave}`,
    pitchClass,
    step,
    alter,
    octave,
    midi,
    abc: toAbcPitchToken({ step, alter, octave }),
    musicXml,
  };
}

export function toAbcPitchToken(
  pitch: Pick<ResolvedPitch, "step" | "alter" | "octave">,
  forceNatural = false,
): string {
  const accidental = pitch.alter === 0 && forceNatural
    ? "="
    : abcAccidentalPrefix(pitch.alter);
  const letter = pitch.octave >= 5 ? pitch.step.toLowerCase() : pitch.step;
  const octaveMarks = pitch.octave >= 5
    ? "'".repeat(pitch.octave - 5)
    : ",".repeat(4 - pitch.octave);
  return `${accidental}${letter}${octaveMarks}`;
}

function resolveAlter(scaleAlter: number, accidental: Accidental | undefined): number {
  switch (accidental) {
    case "sharp":
      return scaleAlter + 1;
    case "flat":
      return scaleAlter - 1;
    case "natural":
      return 0;
    case "double-sharp":
      return scaleAlter + 2;
    case "double-flat":
      return scaleAlter - 2;
    default:
      return scaleAlter;
  }
}

function accidentalSuffix(alter: number): string {
  if (alter === 2) return "##";
  if (alter === 1) return "#";
  if (alter === -1) return "b";
  if (alter === -2) return "bb";
  return "";
}

function abcAccidentalPrefix(alter: number): string {
  if (alter === 2) return "^^";
  if (alter === 1) return "^";
  if (alter === -1) return "_";
  if (alter === -2) return "__";
  return "";
}
