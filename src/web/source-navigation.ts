import type { NoteEvent, Score, Voice } from "../core/ast";

export interface SourceEventRange {
  eventId: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface LyricSourceRange {
  voiceId: string;
  lyricLineIndex: number;
  syllableIndex: number;
  start: number;
  end: number;
  eventIds: string[];
}

interface LyricUnit {
  line: number;
  eventIds: string[];
}

interface LyricTokenRange {
  start: number;
  end: number;
}

export function buildSourceEventRanges(score: Score, source: string): SourceEventRange[] {
  const lineStarts = sourceLineStarts(source);
  const ranges: SourceEventRange[] = [];

  for (const voice of score.voices) {
    for (const [measureIndex, measure] of voice.measures.entries()) {
      for (const [eventIndex, event] of measure.events.entries()) {
        if (!event.location || !event.sourceText) continue;
        const lineStart = lineStarts[event.location.line - 1];
        if (lineStart === undefined) continue;
        const start = lineStart + event.location.column - 1;
        const end = start + event.sourceText.length;
        if (source.slice(start, end) !== event.sourceText) continue;
        ranges.push({
          eventId: `${voice.id}:${measureIndex}:${eventIndex}`,
          start,
          end,
          line: event.location.line,
          column: event.location.column,
        });
      }
    }
  }

  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function buildLyricSourceRanges(score: Score, source: string): LyricSourceRange[] {
  const lineStarts = sourceLineStarts(source);
  const lineEnds = sourceLineEnds(source, lineStarts);
  const ranges: LyricSourceRange[] = [];

  for (const voice of score.voices) {
    const unitsByLine = lyricUnitsByLine(voice);
    const targetedLines = new Set<number>();

    for (const [lyricLineIndex, lyricLine] of voice.lyricLines.entries()) {
      const targetLine = previousUntargetedMusicLine(
        unitsByLine,
        targetedLines,
        lyricLine.line,
      );
      if (targetLine === undefined) continue;
      targetedLines.add(targetLine);

      const lineStart = lineStarts[lyricLine.line - 1];
      const lineEnd = lineEnds[lyricLine.line - 1];
      if (lineStart === undefined || lineEnd === undefined) continue;
      const lyricTokens = lyricTokenRanges(source.slice(lineStart, lineEnd), lineStart);
      const units = unitsByLine.get(targetLine) ?? [];

      for (const [syllableIndex, tokenRange] of lyricTokens.entries()) {
        const unit = units[syllableIndex];
        if (unit === undefined) continue;
        ranges.push({
          voiceId: voice.id,
          lyricLineIndex,
          syllableIndex,
          start: tokenRange.start,
          end: tokenRange.end,
          eventIds: unit.eventIds,
        });
      }
    }
  }

  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function sourceEventAtCaret(
  ranges: SourceEventRange[],
  caret: number,
): SourceEventRange | undefined {
  return ranges.find((range) => caret >= range.start && caret <= range.end);
}

export function sourceEventById(
  ranges: SourceEventRange[],
  eventId: string,
): SourceEventRange | undefined {
  return ranges.find((range) => range.eventId === eventId);
}

export function sourceEventForMeasureCaret(
  eventRanges: SourceEventRange[],
  lyricRanges: LyricSourceRange[],
  caret: number,
): SourceEventRange | undefined {
  const lyricRange = sourceLyricAtCaret(lyricRanges, caret);
  if (lyricRange) {
    for (const eventId of lyricRange.eventIds) {
      const eventRange = sourceEventById(eventRanges, eventId);
      if (eventRange) return eventRange;
    }
  }

  const direct = sourceEventAtCaret(eventRanges, caret);
  if (direct) return direct;
  let previous: SourceEventRange | undefined;
  for (const range of eventRanges) {
    if (range.start > caret) break;
    previous = range;
  }
  return previous;
}

export function sourceLyricAtCaret(
  ranges: LyricSourceRange[],
  caret: number,
): LyricSourceRange | undefined {
  return ranges.find((range) => caret >= range.start && caret <= range.end);
}

export function sourceLyricByEventId(
  ranges: LyricSourceRange[],
  eventId: string,
): LyricSourceRange | undefined {
  return ranges.find((range) => range.eventIds.includes(eventId));
}

function lyricUnitsByLine(voice: Voice): Map<number, LyricUnit[]> {
  const unitsByLine = new Map<number, LyricUnit[]>();
  let currentUnit: LyricUnit | undefined;
  let tieOpen = false;
  let slurOpen = false;

  for (const [measureIndex, measure] of voice.measures.entries()) {
    for (const [eventIndex, event] of measure.events.entries()) {
      const eventId = `${voice.id}:${measureIndex}:${eventIndex}`;
      if (event.type === "extension") {
        currentUnit?.eventIds.push(eventId);
        continue;
      }
      if (event.type !== "note") {
        currentUnit = undefined;
        continue;
      }

      const startsTarget = startsLyricUnit(event, tieOpen, slurOpen);
      if (startsTarget) {
        currentUnit = startLyricUnit(unitsByLine, event, eventId);
      } else {
        currentUnit?.eventIds.push(eventId);
      }

      tieOpen = event.tieStart === true;
      if (event.slurStart) slurOpen = true;
      if (event.slurEnd) slurOpen = false;
    }
  }

  return unitsByLine;
}

function startsLyricUnit(event: NoteEvent, tieOpen: boolean, slurOpen: boolean): boolean {
  return !tieOpen && !slurOpen && !event.tieEnd;
}

function startLyricUnit(
  unitsByLine: Map<number, LyricUnit[]>,
  event: NoteEvent,
  eventId: string,
): LyricUnit | undefined {
  const line = event.location?.line;
  if (line === undefined) return undefined;
  const unit = { line, eventIds: [eventId] };
  const units = unitsByLine.get(line) ?? [];
  units.push(unit);
  unitsByLine.set(line, units);
  return unit;
}

function previousUntargetedMusicLine(
  unitsByLine: Map<number, LyricUnit[]>,
  targetedLines: Set<number>,
  lyricLine: number,
): number | undefined {
  const candidateLines = [...unitsByLine.keys()]
    .filter((line) => line < lyricLine)
    .sort((left, right) => right - left);
  const nearestLine = candidateLines[0];
  return nearestLine !== undefined && !targetedLines.has(nearestLine)
    ? nearestLine
    : undefined;
}

function lyricTokenRanges(lineText: string, lineStart: number): LyricTokenRange[] {
  const fieldMatch = /^(\s*)w:\s*/.exec(lineText);
  if (!fieldMatch) return [];
  const contentStart = fieldMatch[0].length;
  const commentStart = lineText.indexOf("%", contentStart);
  const contentEnd = commentStart < 0 ? lineText.length : commentStart;
  const content = lineText.slice(contentStart, contentEnd);
  const ranges: LyricTokenRange[] = [];
  const tokenPattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content)) !== null) {
    const start = lineStart + contentStart + match.index;
    ranges.push({ start, end: start + match[0].length });
  }
  return ranges;
}

function sourceLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function sourceLineEnds(source: string, lineStarts: number[]): number[] {
  return lineStarts.map((start, index) => {
    const nextStart = lineStarts[index + 1];
    if (nextStart === undefined) return source.length;
    return source[nextStart - 1] === "\n" ? nextStart - 1 : nextStart;
  });
}
