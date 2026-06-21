import type { Fraction } from "../core/ast";
import {
  beatIndex,
  durationLineCount,
  type PositionedEvent,
} from "./jianpu-layout";

export function renderDurationLines(
  positioned: PositionedEvent[],
  beatDuration: Fraction,
  fontSize: number,
  rightBarlineX: number | undefined,
): string {
  const output: string[] = [];
  const maxLevel = positioned.reduce(
    (level, item) => Math.max(level, durationLineCount(item.event, beatDuration)),
    0,
  );

  for (let lineLevel = 1; lineLevel <= maxLevel; lineLevel += 1) {
    let index = 0;
    while (index < positioned.length) {
      const first = positioned[index] as PositionedEvent;
      if (!hasDurationLine(first, beatDuration, lineLevel)) {
        index += 1;
        continue;
      }

      const group = [first];
      let groupEndIndex = index;
      if (isDurationLineJoinable(first)) {
        const firstBeat = beatIndex(first.startTime, beatDuration);
        let scanIndex = index + 1;
        while (scanIndex < positioned.length) {
          const next = positioned[scanIndex] as PositionedEvent;
          const nextBeat = beatIndex(next.startTime, beatDuration);
          if (isDurationLineTransparent(next) && nextBeat === firstBeat) {
            scanIndex += 1;
            continue;
          }
          if (
            !isDurationLineJoinable(next)
            || !hasDurationLine(next, beatDuration, lineLevel)
            || nextBeat !== firstBeat
          ) break;
          group.push(next);
          groupEndIndex = scanIndex;
          scanIndex += 1;
        }
      }

      const previousBoundary = closestDurationLineItem(positioned, index - 1, -1, beatDuration, 1);
      const nextBoundary = closestDurationLineItem(positioned, groupEndIndex + 1, 1, beatDuration, 1);
      const firstBeat = beatIndex(first.startTime, beatDuration);
      const lastBeat = beatIndex(group.at(-1)!.startTime, beatDuration);
      const startsAfterBeatBoundary = previousBoundary !== undefined
        && beatIndex(previousBoundary.startTime, beatDuration) !== firstBeat;
      const endsBeforeBeatBoundary = nextBoundary !== undefined
        && beatIndex(nextBoundary.startTime, beatDuration) !== lastBeat;
      const maxEndX = nextBoundary === undefined && rightBarlineX !== undefined
        ? rightBarlineX - fontSize * 0.32
        : undefined;

      output.push(renderDurationLine(group, lineLevel, fontSize, {
        startsAfterBeatBoundary,
        endsBeforeBeatBoundary,
        ...(maxEndX === undefined ? {} : { maxEndX }),
      }));
      index = groupEndIndex + 1;
    }
  }
  return output.join("");
}

function hasDurationLine(
  item: PositionedEvent,
  beatDuration: Fraction,
  lineLevel: number,
): boolean {
  return durationLineCount(item.event, beatDuration) >= lineLevel;
}

function isDurationLineJoinable(item: PositionedEvent): boolean {
  return item.event.type === "note" || item.event.type === "rest";
}

function isDurationLineTransparent(item: PositionedEvent): boolean {
  return item.event.type === "key-change" || item.event.type === "repeat-marker";
}

function closestDurationLineItem(
  positioned: PositionedEvent[],
  startIndex: number,
  step: -1 | 1,
  beatDuration: Fraction,
  lineLevel: number,
): PositionedEvent | undefined {
  for (let index = startIndex; index >= 0 && index < positioned.length; index += step) {
    const item = positioned[index] as PositionedEvent;
    if (hasDurationLine(item, beatDuration, lineLevel)) return item;
  }
  return undefined;
}

function renderDurationLine(
  group: PositionedEvent[],
  lineLevel: number,
  fontSize: number,
  options: {
    startsAfterBeatBoundary?: boolean;
    endsBeforeBeatBoundary?: boolean;
    maxEndX?: number;
  } = {},
): string {
  const beatBoundaryInset = fontSize * 0.14;
  const startX = group[0]!.centerX - fontSize * 0.34
    + (options.startsAfterBeatBoundary ? beatBoundaryInset : 0);
  const last = group.at(-1)!;
  const rawEndX = durationLineEndX(last, fontSize)
    - (options.endsBeforeBeatBoundary ? beatBoundaryInset : 0);
  const maxEndX = options.maxEndX ?? rawEndX;
  const endX = Math.max(startX + fontSize * 0.18, Math.min(rawEndX, maxEndX));
  const y = fontSize * 0.43 + (lineLevel - 1) * 4.5;
  return `<line class="duration-line" data-line-level="${lineLevel}" data-group-size="${group.length}" x1="${round(startX)}" y1="${round(y)}" x2="${round(endX)}" y2="${round(y)}"/>`;
}

function durationLineEndX(item: PositionedEvent, fontSize: number): number {
  const dots = item.event.type === "note" || item.event.type === "rest" ? item.event.dots ?? 0 : 0;
  const symbolPadding = dots > 0 ? 0.66 + (dots - 1) * 0.18 : 0.34;
  return item.centerX + fontSize * symbolPadding;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
