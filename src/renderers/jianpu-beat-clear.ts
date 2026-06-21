import type { Accidental, Fraction } from "../core/ast";
import {
  layoutXAt,
  type PositionedEvent,
} from "./jianpu-layout";
import type { RhythmDisplayMode } from "./jianpu-renderer";

const ACCIDENTAL_TEXT: Record<Accidental, string> = {
  sharp: "♯",
  flat: "♭",
  natural: "♮",
  "double-sharp": "𝄪",
  "double-flat": "𝄫",
};

interface BeatClearSegment {
  startOffset: number;
  endOffset: number;
  centerX: number;
  span: number;
}

export function shouldSplitBeatClear(
  item: PositionedEvent,
  rhythmDisplay: RhythmDisplayMode,
): boolean {
  if (rhythmDisplay !== "beat-clear") return false;
  if (item.event.type !== "note") return false;
  const endOffset = item.layoutOffset + item.layoutSpan;
  if (isIntegerPosition(item.layoutOffset) && isIntegerPosition(endOffset)) return false;
  return beatClearSegments(item, 1, 0).length > 1;
}

export function renderBeatClearSplitNote(
  positioned: PositionedEvent,
  eventId: string,
  cellWidth: number,
  beatGap: number,
  fontSize: number,
  showLyrics: boolean,
  highlighted: boolean,
): string {
  const event = positioned.event;
  if (event.type !== "note") return "";
  const segments = beatClearSegments(positioned, cellWidth, beatGap);
  const visualStartX = layoutXAt(positioned.layoutOffset, cellWidth, beatGap);
  const visualEndX = layoutXAt(positioned.layoutOffset + positioned.layoutSpan, cellWidth, beatGap);
  const visualWidth = visualEndX - visualStartX;
  const backgroundHeight = fontSize * (showLyrics ? 2.45 : 1.75);
  const className = highlighted ? "jabc-event is-highlighted" : "jabc-event";
  const parts = [
    `<rect class="event-bg" x="${round(visualStartX + visualWidth * 0.1)}" y="${round(-fontSize * 1.25)}" width="${round(visualWidth * 0.8)}" height="${round(backgroundHeight)}" rx="7"/>`,
  ];
  const symbol = String(event.degree);
  const tieY = -fontSize * 0.82;
  const tiePeak = -fontSize * 1.04;
  const tieInset = fontSize * 0.22;

  for (const [index, segment] of segments.entries()) {
    parts.push(`<text class="event-symbol beat-clear-segment" x="${round(segment.centerX)}" y="0">${symbol}</text>`);
    if (event.accidental && index === 0) {
      parts.push(`<text class="event-accidental" x="${round(segment.centerX - fontSize * 0.38)}" y="${round(-fontSize * 0.45)}">${ACCIDENTAL_TEXT[event.accidental]}</text>`);
    }
    parts.push(renderOctaveDots(segment.centerX, event.octaveShift, fontSize));
    parts.push(renderBeatClearSegmentDurationLines(segment.centerX, segment.span, fontSize));
    if (index > 0) {
      const previous = segments[index - 1] as BeatClearSegment;
      parts.push(arcPath(
        "tie-arc beat-clear-tie",
        previous.centerX + tieInset,
        Math.max(previous.centerX + tieInset + fontSize * 0.12, segment.centerX - tieInset),
        tieY,
        tiePeak,
      ));
    }
  }

  if (showLyrics && event.lyric) {
    parts.push(`<text class="event-lyric" x="${round(segments[0]!.centerX)}" y="${round(fontSize * 1.5)}">${escapeXml(event.lyric)}</text>`);
  }

  return `<g class="${className}" data-event-id="${escapeXml(eventId)}" data-beat-clear="split" aria-label="${escapeXml(event.sourceText ?? symbol)}">${parts.join("")}</g>`;
}

function beatClearSegments(item: PositionedEvent, cellWidth: number, beatGap: number): BeatClearSegment[] {
  const output: BeatClearSegment[] = [];
  const endOffset = item.layoutOffset + item.layoutSpan;
  let segmentStart = item.layoutOffset;
  for (let boundary = Math.floor(item.layoutOffset + 1e-9) + 1; boundary < endOffset - 1e-9; boundary += 1) {
    output.push(beatClearSegment(segmentStart, boundary, cellWidth, beatGap));
    segmentStart = boundary;
  }
  output.push(beatClearSegment(segmentStart, endOffset, cellWidth, beatGap));
  return output.filter((segment) => segment.span > 1e-9);
}

function beatClearSegment(startOffset: number, endOffset: number, cellWidth: number, beatGap: number): BeatClearSegment {
  const centerOffset = (startOffset + endOffset) / 2;
  return {
    startOffset,
    endOffset,
    centerX: layoutXAt(centerOffset, cellWidth, beatGap),
    span: endOffset - startOffset,
  };
}

function renderBeatClearSegmentDurationLines(centerX: number, segmentSpan: number, fontSize: number): string {
  const level = durationLineLevel(segmentSpan);
  const output: string[] = [];
  for (let lineLevel = 1; lineLevel <= level; lineLevel += 1) {
    const y = fontSize * 0.43 + (lineLevel - 1) * 4.5;
    output.push(`<line class="duration-line beat-clear-duration-line" data-line-level="${lineLevel}" data-group-size="1" x1="${round(centerX - fontSize * 0.34)}" y1="${round(y)}" x2="${round(centerX + fontSize * 0.34)}" y2="${round(y)}"/>`);
  }
  return output.join("");
}

function durationLineLevel(segmentSpan: number): number {
  if (segmentSpan >= 1) return 0;
  const subdivisions = 1 / segmentSpan;
  return isPowerOfTwo(subdivisions) ? Math.round(Math.log2(subdivisions)) : 0;
}

function renderOctaveDots(centerX: number, octaveShift: number, fontSize: number): string {
  if (octaveShift === 0) return "";
  const output: string[] = [];
  const direction = Math.sign(octaveShift);
  for (let index = 0; index < Math.abs(octaveShift); index += 1) {
    const y = direction > 0
      ? -fontSize * 1.02 - index * 6
      : fontSize * 0.35 + index * 6;
    output.push(`<circle class="octave-dot" cx="${round(centerX)}" cy="${round(y)}" r="2.3"/>`);
  }
  return output.join("");
}

function arcPath(
  className: string,
  x1: number,
  x2: number,
  y: number,
  peak: number,
): string {
  const mid = (x1 + x2) / 2;
  return `<path class="relation-arc ${className}" d="M ${round(x1)} ${round(y)} Q ${round(mid)} ${round(peak)} ${round(x2)} ${round(y)}"/>`;
}

function isIntegerPosition(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && Math.abs(value - Math.round(value)) < 1e-9 && Number.isInteger(Math.log2(Math.round(value)));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
