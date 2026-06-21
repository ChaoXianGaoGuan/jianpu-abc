import type { Score } from "../core/ast";

export interface SourceEventRange {
  eventId: string;
  start: number;
  end: number;
  line: number;
  column: number;
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

function sourceLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}
