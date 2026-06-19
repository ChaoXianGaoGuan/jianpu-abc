export interface Fraction {
  numerator: number;
  denominator: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface Tempo {
  beat: Fraction;
  bpm: number;
}

export type PitchClass =
  | "C"
  | "C#"
  | "Db"
  | "D"
  | "D#"
  | "Eb"
  | "E"
  | "F"
  | "F#"
  | "Gb"
  | "G"
  | "G#"
  | "Ab"
  | "A"
  | "A#"
  | "Bb"
  | "B";

export interface JianpuKey {
  tonic: PitchClass;
  mode?: "major" | "minor" | "pentatonic" | string;
  notation: "jianpu";
}

export interface ScoreHeader {
  index?: string;
  title?: string;
  composer?: string;
  meter?: TimeSignature;
  defaultNoteLength?: Fraction;
  tempo?: Tempo;
  key?: JianpuKey;
  extraFields?: Record<string, string[]>;
}

export interface SourceLocation {
  line: number;
  column: number;
}

export interface Tuplet {
  actual: number;
  normal: number;
  position: "start" | "middle" | "end";
}

export type Accidental =
  | "sharp"
  | "flat"
  | "natural"
  | "double-sharp"
  | "double-flat";

export interface NoteEvent {
  type: "note";
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  accidental?: Accidental;
  octaveShift: number;
  duration: Fraction;
  dots?: number;
  tieStart?: boolean;
  tieEnd?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  tuplet?: Tuplet;
  lyric?: string;
  sourceText?: string;
  location?: SourceLocation;
}

export interface RestEvent {
  type: "rest";
  duration: Fraction;
  dots?: number;
  tuplet?: Tuplet;
  sourceText?: string;
  location?: SourceLocation;
}

export interface ExtensionEvent {
  type: "extension";
  duration: Fraction;
  sourceText: "-";
  location?: SourceLocation;
}

export type MusicalEvent = NoteEvent | RestEvent | ExtensionEvent;

export type BarlineType =
  | "single"
  | "double"
  | "final"
  | "start"
  | "repeat-start"
  | "repeat-end";

export interface Barline {
  type: BarlineType;
  sourceText: "|" | "||" | "|]" | "[|" | "|:" | ":|";
  location?: SourceLocation;
}

export interface Ending {
  number: string;
  sourceText: `[${string}`;
  location?: SourceLocation;
}

export interface Measure {
  events: MusicalEvent[];
  barline?: Barline;
  leftBarline?: Barline;
  ending?: Ending;
}

export interface LyricLine {
  text: string;
  syllables: string[];
  line: number;
}

export interface Voice {
  id: string;
  measures: Measure[];
  lyricLines: LyricLine[];
}

export interface Score {
  type: "Score";
  header: ScoreHeader;
  voices: Voice[];
  raw?: string;
}
