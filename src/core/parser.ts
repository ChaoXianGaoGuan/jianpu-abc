import type {
  Accidental,
  Barline,
  Ending,
  Fraction,
  JianpuKey,
  LyricLine,
  Measure,
  MusicalEvent,
  PitchClass,
  Score,
  ScoreHeader,
  SourceLocation,
  Tempo,
  TimeSignature,
  Tuplet,
  Voice,
} from "./ast";
import type { ParseError, ParseResult } from "./errors";
import {
  DEFAULT_NOTE_LENGTH,
  multiplyFractions,
  parseFraction,
} from "./fraction";
import { normalizeScore } from "./normalize";

interface BodyToken {
  text: string;
  column: number;
}

interface VoiceDraft {
  id: string;
  measures: Measure[];
  lyricLines: LyricLine[];
  currentEvents: MusicalEvent[];
  pendingLeftBarline?: Barline | undefined;
  pendingEnding?: Ending | undefined;
  pendingTuplet?: TupletState | undefined;
  pendingSystemBreak?: boolean | undefined;
}

interface TupletState {
  actual: number;
  normal: number;
  remaining: number;
}

const PITCH_CLASSES = new Set<PitchClass>([
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#",
  "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
]);
const NOTE_TOKEN_PATTERN = /^(\()?(~)?(#{1,2}|b{1,2}|=)?([1-7])('+|,+)?(?:(\/)(\d*)|\*(\d+))?(\.{0,2})(~)?(\))?$/;
const REST_TOKEN_PATTERN = /^(0|z)(?:(\/)(\d*)|\*(\d+))?(\.{0,2})$/;
const INLINE_VOICE_PATTERN = /^\[V:([^\]\s]+)\]$/;
const INLINE_KEY_PATTERN = /^\[K:(.+)\]$/;
const ENDING_TOKEN_PATTERN = /^\[(\d+)$/;
const TUPLET_TOKEN_PATTERN = /^\(3$/;

export function parseJabc(source: string): ParseResult<Score> {
  const header: ScoreHeader = {};
  const voices = new Map<string, VoiceDraft>();
  const voiceOrder: string[] = [];
  const errors: ParseError[] = [];
  let currentVoice = ensureVoice("default", voices, voiceOrder);
  let explicitVoiceSeen = false;

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  for (const [lineIndex, rawLine] of lines.entries()) {
    const lineNumber = lineIndex + 1;
    const content = stripComment(rawLine);
    if (content.trim() === "") continue;

    const leadingWhitespace = content.length - content.trimStart().length;
    const trimmed = content.trim();
    const fieldMatch = /^([A-Za-z]):\s*(.*)$/.exec(trimmed);

    if (fieldMatch) {
      const field = fieldMatch[1] as string;
      const value = fieldMatch[2] as string;
      if (field === "V") {
        const voiceId = parseVoiceId(value);
        if (!voiceId) {
          errors.push(invalidFieldError("V", value, lineNumber, leadingWhitespace + 1, rawLine, "Use a voice field such as V:1 or V:melody."));
        } else {
          finalizeCurrentEvents(currentVoice);
          currentVoice = ensureVoice(voiceId, voices, voiceOrder);
          explicitVoiceSeen = true;
        }
      } else if (field === "w") {
        const text = value.trim();
        currentVoice.lyricLines.push({
          text,
          syllables: text === "" ? [] : text.split(/\s+/),
          line: lineNumber,
        });
      } else {
        parseHeaderField(
          header,
          field,
          value.trim(),
          lineNumber,
          leadingWhitespace + 1,
          rawLine,
          errors,
        );
      }
      continue;
    }

    const touchedVoices = new Set<VoiceDraft>();
    for (const token of tokenizeBody(content)) {
      const inlineVoice = INLINE_VOICE_PATTERN.exec(token.text);
      if (inlineVoice) {
        finalizeCurrentEvents(currentVoice);
        currentVoice = ensureVoice(inlineVoice[1] as string, voices, voiceOrder);
        explicitVoiceSeen = true;
        continue;
      }

      touchedVoices.add(currentVoice);

      const location = { line: lineNumber, column: token.column };
      const inlineKey = INLINE_KEY_PATTERN.exec(token.text);
      if (inlineKey) {
        const key = parseJianpuKey((inlineKey[1] as string).trim());
        if (key) {
          currentVoice.currentEvents.push({
            type: "key-change",
            key,
            sourceText: token.text as `[K:${string}]`,
            location,
          });
        } else {
          errors.push(invalidInlineKeyError(token, lineNumber, rawLine));
        }
        continue;
      }

      const ending = parseEndingToken(token.text, location);
      if (ending) {
        if (currentVoice.currentEvents.length > 0) {
          finalizeCurrentEvents(currentVoice, makeBarline("|", location));
        }
        currentVoice.pendingEnding = ending;
        continue;
      }

      const barline = parseBarlineToken(token.text, location);
      if (barline) {
        handleBarline(currentVoice, barline);
        continue;
      }

      if (TUPLET_TOKEN_PATTERN.test(token.text)) {
        currentVoice.pendingTuplet = { actual: 3, normal: 2, remaining: 3 };
        continue;
      }

      const defaultDuration = header.defaultNoteLength ?? DEFAULT_NOTE_LENGTH;
      if (token.text === "-") {
        currentVoice.currentEvents.push({
          type: "extension",
          duration: cloneFraction(defaultDuration),
          sourceText: "-",
          location,
        });
      } else {
        const event = parseMusicToken(token.text, defaultDuration, location);
        if (event) currentVoice.currentEvents.push(applyTuplet(currentVoice, event));
        else errors.push(unknownTokenError(token, lineNumber, rawLine));
      }
    }
    for (const voice of touchedVoices) markSystemBreak(voice);
  }

  for (const voice of voices.values()) finalizeCurrentEvents(voice);
  if (errors.length > 0) return { success: false, errors };

  const scoreVoices = voiceOrder
    .map((id) => voices.get(id))
    .filter((voice): voice is VoiceDraft => voice !== undefined)
    .filter((voice) => !explicitVoiceSeen || voice.id !== "default" || voice.measures.length > 0 || voice.lyricLines.length > 0)
    .map((voice): Voice => ({
      id: voice.id,
      measures: voice.measures,
      lyricLines: voice.lyricLines,
    }));

  const score: Score = {
    type: "Score",
    header,
    voices: scoreVoices.length === 0
      ? [{ id: "default", measures: [], lyricLines: [] }]
      : scoreVoices,
    raw: source,
  };
  return { success: true, value: normalizeScore(score), errors: [] };
}

function parseMusicToken(
  text: string,
  defaultDuration: Fraction,
  location: SourceLocation,
): MusicalEvent | undefined {
  const noteMatch = NOTE_TOKEN_PATTERN.exec(text);
  if (noteMatch) {
    const duration = parseTokenDuration(
      defaultDuration,
      noteMatch[6],
      noteMatch[7],
      noteMatch[8],
      noteMatch[9] as string,
    );
    if (!duration) return undefined;

    const accidental = parseAccidental(noteMatch[3]);
    const octaveText = noteMatch[5] ?? "";
    const dots = (noteMatch[9] as string).length;
    const slurStart = noteMatch[1] === "(";
    const tieEnd = noteMatch[2] === "~";
    const tieStart = noteMatch[10] === "~";
    const slurEnd = noteMatch[11] === ")";
    return {
      type: "note",
      degree: Number(noteMatch[4]) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      ...(accidental === undefined ? {} : { accidental }),
      octaveShift: octaveText === ""
        ? 0
        : octaveText.startsWith("'") ? octaveText.length : -octaveText.length,
      duration,
      ...(dots === 0 ? {} : { dots }),
      ...(tieStart ? { tieStart } : {}),
      ...(tieEnd ? { tieEnd } : {}),
      ...(slurStart ? { slurStart } : {}),
      ...(slurEnd ? { slurEnd } : {}),
      sourceText: text,
      location,
    };
  }

  const restMatch = REST_TOKEN_PATTERN.exec(text);
  if (!restMatch) return undefined;
  const duration = parseTokenDuration(
    defaultDuration,
    restMatch[2],
    restMatch[3],
    restMatch[4],
    restMatch[5] as string,
  );
  if (!duration) return undefined;

  const dots = (restMatch[5] as string).length;
  return {
    type: "rest",
    duration,
    ...(dots === 0 ? {} : { dots }),
    sourceText: text,
    location,
  };
}

function parseTokenDuration(
  defaultDuration: Fraction,
  slash: string | undefined,
  slashDigits: string | undefined,
  multiplierDigits: string | undefined,
  dotsText: string,
): Fraction | undefined {
  let factor: Fraction = { numerator: 1, denominator: 1 };
  if (slash !== undefined) {
    const divisor = slashDigits === "" ? 2 : Number(slashDigits);
    if (!Number.isInteger(divisor) || divisor < 1) return undefined;
    factor = { numerator: 1, denominator: divisor };
  } else if (multiplierDigits !== undefined) {
    const multiplier = Number(multiplierDigits);
    if (!Number.isInteger(multiplier) || multiplier < 1) return undefined;
    factor = { numerator: multiplier, denominator: 1 };
  }

  const dots = dotsText.length;
  const dotFactor: Fraction = dots === 0
    ? { numerator: 1, denominator: 1 }
    : { numerator: 2 ** (dots + 1) - 1, denominator: 2 ** dots };
  return multiplyFractions(defaultDuration, multiplyFractions(factor, dotFactor));
}

function parseAccidental(value: string | undefined): Accidental | undefined {
  if (value === "#") return "sharp";
  if (value === "##") return "double-sharp";
  if (value === "b") return "flat";
  if (value === "bb") return "double-flat";
  if (value === "=") return "natural";
  return undefined;
}

function parseHeaderField(
  header: ScoreHeader,
  field: string,
  value: string,
  line: number,
  column: number,
  context: string,
  errors: ParseError[],
): void {
  switch (field) {
    case "X":
      header.index = value;
      break;
    case "T":
      header.title = value;
      break;
    case "C":
      header.composer = value;
      break;
    case "M": {
      const meter = parseTimeSignature(value);
      if (meter) header.meter = meter;
      else errors.push(invalidFieldError(field, value, line, column, context, "Use a meter such as M:4/4."));
      break;
    }
    case "L": {
      const length = parseFraction(value);
      if (length) header.defaultNoteLength = length;
      else errors.push(invalidFieldError(field, value, line, column, context, "Use a note length such as L:1/4."));
      break;
    }
    case "Q": {
      const tempo = parseTempo(value);
      if (tempo) header.tempo = tempo;
      else errors.push(invalidFieldError(field, value, line, column, context, "Use a tempo such as Q:1/4=120."));
      break;
    }
    case "K": {
      const key = parseJianpuKey(value);
      if (key) header.key = key;
      else errors.push(invalidFieldError(field, value, line, column, context, "Use a jianpu key such as K:C jianpu."));
      break;
    }
    default: {
      const fields = (header.extraFields ??= {});
      (fields[field] ??= []).push(value);
    }
  }
}

function parseTimeSignature(value: string): TimeSignature | undefined {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
  if (!match) return undefined;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator > 0 && denominator > 0 ? { numerator, denominator } : undefined;
}

function parseTempo(value: string): Tempo | undefined {
  const match = /^(\d+\s*\/\s*\d+)\s*=\s*(\d+)$/.exec(value);
  if (!match) return undefined;
  const beat = parseFraction(match[1] as string);
  const bpm = Number(match[2]);
  return beat && bpm > 0 ? { beat, bpm } : undefined;
}

function parseJianpuKey(value: string): JianpuKey | undefined {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.at(-1)?.toLowerCase() !== "jianpu") return undefined;

  const tonic = parts[0];
  if (!tonic || !isPitchClass(tonic)) return undefined;

  const mode = parts.slice(1, -1).join(" ");
  return mode === ""
    ? { tonic, notation: "jianpu" }
    : { tonic, mode, notation: "jianpu" };
}

function parseVoiceId(value: string): string | undefined {
  const id = value.trim().split(/\s+/)[0];
  return id === undefined || id === "" ? undefined : id;
}

function isPitchClass(value: string): value is PitchClass {
  return PITCH_CLASSES.has(value as PitchClass);
}

function ensureVoice(id: string, voices: Map<string, VoiceDraft>, order: string[]): VoiceDraft {
  const existing = voices.get(id);
  if (existing) return existing;
  const created: VoiceDraft = { id, measures: [], lyricLines: [], currentEvents: [] };
  voices.set(id, created);
  order.push(id);
  return created;
}

function applyTuplet(voice: VoiceDraft, event: MusicalEvent): MusicalEvent {
  const state = voice.pendingTuplet;
  if (!state || event.type === "extension" || event.type === "key-change") return event;

  const position: Tuplet["position"] = state.remaining === state.actual
    ? "start"
    : state.remaining === 1 ? "end" : "middle";
  const updated = {
    ...event,
    duration: multiplyFractions(event.duration, {
      numerator: state.normal,
      denominator: state.actual,
    }),
    tuplet: {
      actual: state.actual,
      normal: state.normal,
      position,
    },
  };

  state.remaining -= 1;
  if (state.remaining <= 0) voice.pendingTuplet = undefined;
  return updated;
}

function finalizeCurrentEvents(voice: VoiceDraft, barline?: Barline): void {
  if (voice.currentEvents.length === 0) {
    if (barline && isStartBarline(barline)) voice.pendingLeftBarline = barline;
    return;
  }
  const measure: Measure = { events: voice.currentEvents };
  if (voice.pendingLeftBarline) measure.leftBarline = voice.pendingLeftBarline;
  if (voice.pendingEnding) measure.ending = voice.pendingEnding;
  if (voice.pendingSystemBreak) measure.systemBreakAfter = true;
  if (barline) measure.barline = barline;
  voice.measures.push(measure);
  voice.currentEvents = [];
  voice.pendingLeftBarline = undefined;
  voice.pendingEnding = undefined;
  voice.pendingSystemBreak = undefined;
}

function markSystemBreak(voice: VoiceDraft): void {
  if (voice.currentEvents.length > 0) {
    voice.pendingSystemBreak = true;
    return;
  }
  const lastMeasure = voice.measures.at(-1);
  if (lastMeasure) lastMeasure.systemBreakAfter = true;
}

function handleBarline(voice: VoiceDraft, barline: Barline): void {
  if (isStartBarline(barline)) {
    if (voice.currentEvents.length > 0) {
      finalizeCurrentEvents(voice, makeBarline("|", barline.location));
    }
    voice.pendingLeftBarline = barline;
    return;
  }
  finalizeCurrentEvents(voice, barline);
}

function parseEndingToken(text: string, location: SourceLocation): Ending | undefined {
  const match = ENDING_TOKEN_PATTERN.exec(text);
  return match ? { number: match[1] as string, sourceText: text as `[${string}`, location } : undefined;
}

function parseBarlineToken(text: string, location: SourceLocation): Barline | undefined {
  if (text === "|") return makeBarline("|", location);
  if (text === "||") return makeBarline("||", location);
  if (text === "|]") return makeBarline("|]", location);
  if (text === "[|") return makeBarline("[|", location);
  if (text === "|:") return makeBarline("|:", location);
  if (text === ":|") return makeBarline(":|", location);
  return undefined;
}

function makeBarline(sourceText: Barline["sourceText"], location?: SourceLocation): Barline {
  const type: Barline["type"] = sourceText === "|"
    ? "single"
    : sourceText === "||"
      ? "double"
      : sourceText === "|]"
        ? "final"
        : sourceText === "[|"
          ? "start"
          : sourceText === "|:"
            ? "repeat-start"
            : "repeat-end";
  return location === undefined ? { type, sourceText } : { type, sourceText, location };
}

function isStartBarline(barline: Barline): boolean {
  return barline.type === "start" || barline.type === "repeat-start";
}

function tokenizeBody(line: string): BodyToken[] {
  const tokens: BodyToken[] = [];
  const symbolicTokens = ["|:", ":|", "||", "|]", "[|"];
  let index = 0;
  while (index < line.length) {
    if (/\s/.test(line[index] as string)) {
      index += 1;
      continue;
    }

    if (line.startsWith("[K:", index)) {
      const closeIndex = line.indexOf("]", index);
      if (closeIndex !== -1) {
        tokens.push({ text: line.slice(index, closeIndex + 1), column: index + 1 });
        index = closeIndex + 1;
        continue;
      }
    }

    const symbolic = symbolicTokens.find((candidate) => line.startsWith(candidate, index));
    if (symbolic) {
      tokens.push({ text: symbolic, column: index + 1 });
      index += symbolic.length;
      continue;
    }

    if (line[index] === "|") {
      tokens.push({ text: "|", column: index + 1 });
      index += 1;
      continue;
    }

    const start = index;
    while (index < line.length && !/[\s|]/.test(line[index] as string)) {
      if (symbolicTokens.some((candidate) => line.startsWith(candidate, index))) break;
      index += 1;
    }
    tokens.push({ text: line.slice(start, index), column: start + 1 });
  }
  return tokens;
}

function stripComment(line: string): string {
  const commentStart = line.indexOf("%");
  return commentStart === -1 ? line : line.slice(0, commentStart);
}

function cloneFraction(value: Fraction): Fraction {
  return { numerator: value.numerator, denominator: value.denominator };
}

function invalidFieldError(
  field: string,
  value: string,
  line: number,
  column: number,
  context: string,
  suggestion: string,
): ParseError {
  return {
    type: "ParseError",
    message: `Invalid ${field}: field value "${value}".`,
    line,
    column,
    context,
    token: value,
    suggestion,
  };
}

function invalidInlineKeyError(token: BodyToken, line: number, context: string): ParseError {
  return {
    type: "ParseError",
    message: `Invalid inline K: key change "${token.text}".`,
    line,
    column: token.column,
    context,
    token: token.text,
    suggestion: "Use an inline jianpu key such as [K:G jianpu].",
  };
}

function unknownTokenError(token: BodyToken, line: number, context: string): ParseError {
  const suggestion = token.text === "8"
    ? "JABC only supports note degrees 1-7. Did you mean \"1'\" or \"#1\"?"
    : "Use syntax such as #4'/2., 1,,*2, 0/2, extension -, voice [V:1], repeat |: :|, or barline |.";
  return {
    type: "ParseError",
    message: `Unknown token "${token.text}".`,
    line,
    column: token.column,
    context,
    token: token.text,
    suggestion,
  };
}
