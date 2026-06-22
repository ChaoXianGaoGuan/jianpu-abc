import type {
  Fraction,
  KeyChangeEvent,
  Measure,
  MusicalEvent,
  NoteEvent,
  RepeatMarkerEvent,
  RestEvent,
} from "../core/ast";
import { reduceFraction } from "../core/fraction";

export interface LayoutMeasure {
  measure: Measure;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  cellWidth: number;
  beatGap: number;
}

export interface PositionedEvent {
  event: MusicalEvent;
  eventIndex: number;
  centerX: number;
  slotCount: number;
  layoutSpan: number;
  layoutOffset: number;
  dotXs: number[];
  startTime: Fraction;
}

interface MeasureLayoutMetric {
  slotCount: number;
  naturalWidth: number;
  beatGapCount: number;
  cellWidth: number;
}

export function layoutMeasures(
  measures: Measure[],
  width: number,
  padding: number,
  musicTop: number,
  lineHeight: number,
  fontSize: number,
  beatDuration: Fraction,
  alignMeasuresAcrossSystems: boolean,
  minCellWidth: number,
): LayoutMeasure[] {
  const availableWidth = width - padding * 2;
  const baseCellWidth = fontSize * 1.5;
  const barSpace = fontSize * 0.55;
  const measureGap = fontSize * 0.35;
  const beatGap = fontSize * 0.28;
  const output: LayoutMeasure[] = [];
  const hasExplicitSystems = measures
    .slice(0, -1)
    .some((measure) => measure.systemBreakAfter);

  if (hasExplicitSystems) {
    const systems: Array<Array<{ measure: Measure; measureIndex: number }>> = [];
    let currentSystem: Array<{ measure: Measure; measureIndex: number }> = [];
    for (const [measureIndex, measure] of measures.entries()) {
      currentSystem.push({ measure, measureIndex });
      if (measure.systemBreakAfter) {
        systems.push(currentSystem);
        currentSystem = [];
      }
    }
    if (currentSystem.length > 0) systems.push(currentSystem);

    const systemMetrics = systems.map((system) => system.map(({ measure }) =>
      measureLayoutMetric(measure, beatDuration, fontSize, baseCellWidth, barSpace)
    ));
    const alignedColumnWidths = alignMeasuresAcrossSystems
      ? columnWidths(systemMetrics)
      : [];
    const alignedReadableColumnWidths = alignMeasuresAcrossSystems
      ? columnReadableWidths(systemMetrics, minCellWidth, beatGap, barSpace)
      : [];
    const alignedBaseColumnWidths = alignMeasuresAcrossSystems
      ? alignedColumnWidths.map((naturalWidth, index) =>
        Math.max(naturalWidth, alignedReadableColumnWidths[index] ?? 0)
      )
      : [];
    const alignedGridWidth = alignedBaseColumnWidths.reduce(
      (sum, measureWidth) => sum + measureWidth,
      0,
    ) + Math.max(0, alignedBaseColumnWidths.length - 1) * measureGap;

    const targetAvailableWidth = alignMeasuresAcrossSystems
      ? Math.max(availableWidth, alignedGridWidth)
      : Math.max(
        availableWidth,
        ...systemMetrics.map((metrics) =>
          metrics.reduce(
            (sum, metric) => sum + readableMeasureWidth(metric, minCellWidth, beatGap, barSpace),
            0,
          ) + Math.max(0, metrics.length - 1) * measureGap
        ),
      );

    let systemY = musicTop;
    for (const [systemIndex, system] of systems.entries()) {
      const metrics = systemMetrics[systemIndex] ?? [];
      const naturalWidths = alignMeasuresAcrossSystems
        ? metrics.map((metric, index) => alignedBaseColumnWidths[index] ?? metric.naturalWidth)
        : metrics.map((metric) => metric.naturalWidth);
      const readableWidths = alignMeasuresAcrossSystems
        ? metrics.map((metric, index) => alignedReadableColumnWidths[index] ?? readableMeasureWidth(metric, minCellWidth, beatGap, barSpace))
        : metrics.map((metric) => readableMeasureWidth(metric, minCellWidth, beatGap, barSpace));
      const naturalTotal = naturalWidths.reduce((sum, measureWidth) => sum + measureWidth, 0)
        + Math.max(0, system.length - 1) * measureGap;
      const scaleBase = alignMeasuresAcrossSystems ? alignedGridWidth : naturalTotal;
      const scale = scaleBase <= 0 ? 1 : targetAvailableWidth / scaleBase;
      const scaledGap = measureGap * scale;
      let systemX = padding;
      for (const [index, item] of system.entries()) {
        const metric = metrics[index] as MeasureLayoutMetric;
        const naturalWidth = naturalWidths[index] ?? metric.naturalWidth;
        const readableWidth = readableWidths[index] ?? readableMeasureWidth(metric, minCellWidth, beatGap, barSpace);
        const scaledBarSpace = barSpace * scale;
        const scaledBeatGap = beatGap * scale;
        const measureWidth = alignMeasuresAcrossSystems
          ? naturalWidth * scale
          : Math.max(
            naturalWidth * scale,
            readableMeasureWidth(metric, minCellWidth, scaledBeatGap, scaledBarSpace),
          );
        const cellWidth = Math.max(
          minCellWidth,
          (measureWidth - scaledBarSpace - metric.beatGapCount * scaledBeatGap) / metric.slotCount,
        );
        output.push({
          measure: item.measure,
          measureIndex: item.measureIndex,
          x: systemX,
          y: systemY,
          width: measureWidth,
          cellWidth,
          beatGap: scaledBeatGap,
        });
        systemX += measureWidth + scaledGap;
      }
      systemY += lineHeight;
    }
    return output;
  }

  const rows: Array<Array<{
    measure: Measure;
    measureIndex: number;
    metric: MeasureLayoutMetric;
    measureWidth: number;
  }>> = [];
  let currentRow: Array<{
    measure: Measure;
    measureIndex: number;
    metric: MeasureLayoutMetric;
    measureWidth: number;
  }> = [];
  let currentRowWidth = 0;

  for (const [measureIndex, measure] of measures.entries()) {
    const metric = measureLayoutMetric(
      measure,
      beatDuration,
      fontSize,
      baseCellWidth,
      barSpace,
    );
    const measureWidth = Math.max(
      Math.min(availableWidth, metric.naturalWidth),
      readableMeasureWidth(metric, minCellWidth, beatGap, barSpace),
    );
    const nextRowWidth = currentRowWidth
      + (currentRow.length === 0 ? 0 : measureGap)
      + measureWidth;
    if (currentRow.length > 0 && nextRowWidth > availableWidth) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }
    currentRow.push({ measure, measureIndex, metric, measureWidth });
    currentRowWidth += (currentRow.length === 1 ? 0 : measureGap) + measureWidth;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const targetAvailableWidth = alignMeasuresAcrossSystems
    ? availableWidth
    : Math.max(
      availableWidth,
      ...rows.map((row) =>
        row.reduce((sum, item) => sum + item.measureWidth, 0)
        + Math.max(0, row.length - 1) * measureGap
      ),
    );

  let y = musicTop;
  for (const row of rows) {
    const naturalTotal = row.reduce((sum, item) => sum + item.measureWidth, 0)
      + Math.max(0, row.length - 1) * measureGap;
    const scale = alignMeasuresAcrossSystems || naturalTotal <= 0
      ? 1
      : targetAvailableWidth / naturalTotal;
    const scaledGap = measureGap * scale;
    const scaledBarSpace = barSpace * scale;
    const scaledBeatGap = beatGap * scale;
    let x = padding;
    for (const item of row) {
      const measureWidth = item.measureWidth * scale;
      const cellWidth = Math.max(
        minCellWidth,
        (measureWidth - scaledBarSpace - item.metric.beatGapCount * scaledBeatGap)
          / item.metric.slotCount,
      );
      output.push({
        measure: item.measure,
        measureIndex: item.measureIndex,
        x,
        y,
        width: measureWidth,
        cellWidth,
        beatGap: scaledBeatGap,
      });
      x += measureWidth + scaledGap;
    }
    y += lineHeight;
  }
  return output;
}

export function positionEvents(
  placed: LayoutMeasure,
  beatDuration: Fraction,
  fontSize: number,
  leftBoundaryX = 0,
): PositionedEvent[] {
  let slotOffset = 0;
  let startTime: Fraction = { numerator: 0, denominator: 1 };
  const layoutSpans = measureEventLayoutSpans(placed.measure, beatDuration);
  return placed.measure.events.map((event, eventIndex) => {
    const slotCount = visualSlotCount(event, beatDuration);
    const layoutSpan = layoutSpans[eventIndex] ?? eventLayoutSpan(event, beatDuration);
    const dots = event.type === "note" || event.type === "rest" ? event.dots ?? 0 : 0;
    const visualUnitSpan = layoutSpan / (dots + 1);
    const markerSpan = isZeroTimeEvent(event)
      ? nextTimedLayoutSpan(placed.measure.events, layoutSpans, eventIndex, beatDuration)
      : visualUnitSpan;
    const measureSpan = layoutSpans.reduce((total, span) => total + span, 0);
    const trailingKeyChange = event.type === "key-change"
      && !hasTimedEventAfter(placed.measure.events, eventIndex);
    const centerOffset = event.type === "repeat-marker"
      ? slotOffset
      : slotOffset + Math.min(markerSpan, 1) / 2;
    const centerX = event.type === "repeat-marker"
      ? repeatMarkerBoundaryX(placed, centerOffset, measureSpan, fontSize, leftBoundaryX)
      : trailingKeyChange
        ? placed.width - fontSize * 0.22
      : layoutXAt(
        centerOffset,
        placed.cellWidth,
        placed.beatGap,
      );
    const dotXs: number[] = [];
    for (let index = 0; index < dots; index += 1) {
      dotXs.push(centerX + fontSize * (0.40 + index * 0.20));
    }
    const positioned: PositionedEvent = {
      event,
      eventIndex,
      centerX,
      slotCount,
      layoutSpan,
      layoutOffset: slotOffset,
      dotXs,
      startTime,
    };
    if (!isZeroTimeEvent(event)) {
      slotOffset += layoutSpan;
      startTime = addFractions(startTime, event.duration);
    }
    return positioned;
  });
}

export function layoutXAt(offset: number, cellWidth: number, beatGap: number): number {
  const completedBeats = Math.max(0, Math.floor(offset - 1e-9));
  return offset * cellWidth + completedBeats * beatGap;
}

function repeatMarkerBoundaryX(
  placed: LayoutMeasure,
  offset: number,
  measureSpan: number,
  fontSize: number,
  leftBoundaryX: number,
): number {
  if (offset <= 1e-9) return leftBoundaryX;
  if (offset >= measureSpan - 1e-9) return placed.width - fontSize * 0.22;
  return layoutXAt(offset, placed.cellWidth, placed.beatGap);
}

function readableMeasureWidth(
  metric: MeasureLayoutMetric,
  minCellWidth: number,
  beatGap: number,
  barSpace: number,
): number {
  const readableCellWidth = Math.max(minCellWidth, metric.cellWidth * 0.72);
  return metric.slotCount * readableCellWidth + metric.beatGapCount * beatGap + barSpace;
}

function columnWidths(
  systemMetrics: MeasureLayoutMetric[][],
): number[] {
  const output: number[] = [];
  for (const metrics of systemMetrics) {
    for (const [index, metric] of metrics.entries()) {
      output[index] = Math.max(output[index] ?? 0, metric.naturalWidth);
    }
  }
  return output;
}

function columnReadableWidths(
  systemMetrics: MeasureLayoutMetric[][],
  minCellWidth: number,
  beatGap: number,
  barSpace: number,
): number[] {
  const output: number[] = [];
  for (const metrics of systemMetrics) {
    for (const [index, metric] of metrics.entries()) {
      output[index] = Math.max(
        output[index] ?? 0,
        readableMeasureWidth(metric, minCellWidth, beatGap, barSpace),
      );
    }
  }
  return output;
}

function measureLayoutMetric(
  measure: Measure,
  beatDuration: Fraction,
  fontSize: number,
  baseCellWidth: number,
  barSpace: number,
): MeasureLayoutMetric {
  const layoutSpans = measureEventLayoutSpans(measure, beatDuration);
  const slotCount = Math.max(1, layoutSpans.reduce((total, span) => total + span, 0));
  const beatGapCount = measureBeatGapCount(slotCount);
  const cellWidth = measure.events.reduce((requiredWidth, event, index) => {
    if (isZeroTimeEvent(event)) return requiredWidth;
    const span = Math.min(1, layoutSpans[index] ?? eventLayoutSpan(event, beatDuration));
    const minimumEventWidth = fontSize * (
      event.type === "note" && event.accidental !== undefined ? 1 : 0.82
    );
    return Math.max(requiredWidth, minimumEventWidth / span);
  }, baseCellWidth);
  return {
    slotCount,
    naturalWidth: slotCount * cellWidth + beatGapCount * fontSize * 0.28 + barSpace,
    beatGapCount,
    cellWidth,
  };
}

function measureBeatGapCount(slotCount: number): number {
  return Math.max(0, Math.ceil(slotCount - 1e-9) - 1);
}

function nextTimedLayoutSpan(
  events: MusicalEvent[],
  layoutSpans: number[],
  eventIndex: number,
  beatDuration: Fraction,
): number {
  for (let index = eventIndex + 1; index < events.length; index += 1) {
    const event = events[index] as MusicalEvent;
    if (isZeroTimeEvent(event)) continue;
    return layoutSpans[index] ?? eventLayoutSpan(event, beatDuration);
  }
  return 1;
}

function hasTimedEventAfter(events: MusicalEvent[], eventIndex: number): boolean {
  return events.slice(eventIndex + 1).some((event) => !isZeroTimeEvent(event));
}

function visualSlotCount(event: MusicalEvent, beatDuration: Fraction): number {
  if (isZeroTimeEvent(event)) return 0;
  if (event.type === "extension") return 1;
  const ratio = divideFractions(notationDuration(event), beatDuration);
  return ratio.denominator === 1 && ratio.numerator > 1 ? ratio.numerator : 1;
}

function eventLayoutSpan(event: MusicalEvent, beatDuration: Fraction): number {
  if (isZeroTimeEvent(event)) return 0;
  const ratio = divideFractions(event.duration, beatDuration);
  return ratio.numerator / ratio.denominator;
}

function measureEventLayoutSpans(measure: Measure, beatDuration: Fraction): number[] {
  const spans = measure.events.map((event) => eventLayoutSpan(event, beatDuration));
  const groups = new Map<number, number[]>();
  let elapsed: Fraction = { numerator: 0, denominator: 1 };

  for (const [index, event] of measure.events.entries()) {
    if (isZeroTimeEvent(event)) continue;
    const indexInBeat = beatIndex(elapsed, beatDuration);
    const group = groups.get(indexInBeat) ?? [];
    group.push(index);
    groups.set(indexInBeat, group);
    elapsed = addFractions(elapsed, event.duration);
  }

  for (const indices of groups.values()) {
    if (indices.length !== 2) continue;
    const firstIndex = indices[0]!;
    const secondIndex = indices[1]!;
    const first = measure.events[firstIndex]!;
    const second = measure.events[secondIndex]!;
    if (!isNoteOrRest(first) || !isNoteOrRest(second)) continue;
    const dottedIndex = (first.dots ?? 0) === 1
      ? firstIndex
      : (second.dots ?? 0) === 1 ? secondIndex : undefined;
    if (dottedIndex === undefined) continue;
    const plainIndex = dottedIndex === firstIndex ? secondIndex : firstIndex;
    const dotted = dottedIndex === firstIndex ? first : second;
    const plain = plainIndex === firstIndex ? first : second;
    if ((plain.dots ?? 0) !== 0) continue;
    const dottedBaseSpan = undottedLayoutSpan(dotted, beatDuration);
    const plainSpan = eventLayoutSpan(plain, beatDuration);
    const totalSpan = (spans[dottedIndex] ?? 0) + plainSpan;
    if (
      Math.abs(totalSpan - 1) > 1e-9
      || Math.abs(dottedBaseSpan - plainSpan * 2) > 1e-9
    ) continue;
    spans[dottedIndex] = 2 / 3;
    spans[plainIndex] = 1 / 3;
  }
  return spans;
}

function isZeroTimeEvent(event: MusicalEvent): event is KeyChangeEvent | RepeatMarkerEvent {
  return event.type === "key-change" || event.type === "repeat-marker";
}

function isNoteOrRest(event: MusicalEvent): event is NoteEvent | RestEvent {
  return event.type === "note" || event.type === "rest";
}

function undottedLayoutSpan(event: MusicalEvent, beatDuration: Fraction): number {
  if (isZeroTimeEvent(event) || event.type === "extension") {
    return eventLayoutSpan(event, beatDuration);
  }
  const duration = removeDots(event.duration, event.dots ?? 0);
  const ratio = divideFractions(duration, beatDuration);
  return ratio.numerator / ratio.denominator;
}

export function durationLineCount(event: MusicalEvent, beatDuration: Fraction): number {
  if (isZeroTimeEvent(event) || event.type === "extension") return 0;
  const subdivisions = divideFractions(beatDuration, notationDuration(event));
  return subdivisions.denominator === 1 && isPowerOfTwo(subdivisions.numerator)
    ? Math.log2(subdivisions.numerator)
    : 0;
}

function notationDuration(event: MusicalEvent): Fraction {
  if (isZeroTimeEvent(event)) return { numerator: 0, denominator: 1 };
  if (event.type === "extension") return event.duration;
  let duration = removeDots(event.duration, event.dots ?? 0);
  if (event.tuplet) {
    duration = reduceFraction({
      numerator: duration.numerator * event.tuplet.actual,
      denominator: duration.denominator * event.tuplet.normal,
    });
  }
  return duration;
}

function removeDots(duration: Fraction, dots: number): Fraction {
  if (dots === 0) return duration;
  const dotNumerator = 2 ** (dots + 1) - 1;
  const dotDenominator = 2 ** dots;
  return reduceFraction({
    numerator: duration.numerator * dotDenominator,
    denominator: duration.denominator * dotNumerator,
  });
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}

function divideFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator,
    denominator: left.denominator * right.numerator,
  });
}

export function beatIndex(startTime: Fraction, beatDuration: Fraction): number {
  const ratio = divideFractions(startTime, beatDuration);
  return Math.floor(ratio.numerator / ratio.denominator);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && Number.isInteger(Math.log2(value));
}
