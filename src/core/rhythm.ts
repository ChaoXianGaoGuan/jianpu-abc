import type {
  Fraction,
  Measure,
  MusicalEvent,
  TimeSignature,
} from "./ast";
import { DEFAULT_NOTE_LENGTH, reduceFraction } from "./fraction";

export interface BeatBoundarySpan {
  startsOnBeat: boolean;
  endsOnBeat: boolean;
  crossesBeat: boolean;
}

export interface EventTimeSpan extends BeatBoundarySpan {
  event: MusicalEvent;
  eventIndex: number;
  start: Fraction;
  duration: Fraction;
  end: Fraction;
  beatIndex: number;
}

export interface MeasureRhythm {
  spans: EventTimeSpan[];
  actualDuration: Fraction;
  expectedDuration: Fraction;
  beatDuration: Fraction;
  isComplete: boolean;
  isUnderfull: boolean;
  isOverfull: boolean;
}

export function beatDurationForMeter(
  meter: TimeSignature | undefined,
  fallback: Fraction = DEFAULT_NOTE_LENGTH,
): Fraction {
  return meter
    ? { numerator: 1, denominator: meter.denominator }
    : fallback;
}

export function meterDuration(
  meter: TimeSignature | undefined,
  fallback: Fraction = DEFAULT_NOTE_LENGTH,
): Fraction {
  return meter
    ? reduceFraction({ numerator: meter.numerator, denominator: meter.denominator })
    : fallback;
}

export function analyzeMeasureRhythm(
  measure: Measure,
  meter: TimeSignature | undefined,
  fallback: Fraction = DEFAULT_NOTE_LENGTH,
): MeasureRhythm {
  const beatDuration = beatDurationForMeter(meter, fallback);
  const expectedDuration = meterDuration(meter, fallback);
  const spans = eventTimeSpans(measure, beatDuration);
  const actualDuration = measureDuration(measure);
  const comparison = compareFractions(actualDuration, expectedDuration);
  return {
    spans,
    actualDuration,
    expectedDuration,
    beatDuration,
    isComplete: comparison === 0,
    isUnderfull: comparison < 0,
    isOverfull: comparison > 0,
  };
}

export function eventTimeSpans(measure: Measure, beatDuration: Fraction): EventTimeSpan[] {
  const spans: EventTimeSpan[] = [];
  let elapsed: Fraction = { numerator: 0, denominator: 1 };

  for (const [eventIndex, event] of measure.events.entries()) {
    const duration = eventDuration(event);
    const end = addFractions(elapsed, duration);
    spans.push({
      event,
      eventIndex,
      start: elapsed,
      duration,
      end,
      beatIndex: beatIndexAt(elapsed, beatDuration),
      startsOnBeat: isBeatBoundary(elapsed, beatDuration),
      endsOnBeat: isBeatBoundary(end, beatDuration),
      crossesBeat: crossesBeatBoundary(elapsed, end, beatDuration),
    });
    elapsed = end;
  }

  return spans;
}

export function measureDuration(measure: Measure): Fraction {
  return measure.events.reduce(
    (duration, event) => addFractions(duration, eventDuration(event)),
    { numerator: 0, denominator: 1 },
  );
}

export function eventDuration(event: MusicalEvent): Fraction {
  return event.type === "key-change" || event.type === "repeat-marker"
    ? { numerator: 0, denominator: 1 }
    : event.duration;
}

export function beatIndexAt(time: Fraction, beatDuration: Fraction): number {
  const ratio = divideFractions(time, beatDuration);
  return Math.floor(ratio.numerator / ratio.denominator);
}

export function isBeatBoundary(time: Fraction, beatDuration: Fraction): boolean {
  const ratio = divideFractions(time, beatDuration);
  return ratio.numerator % ratio.denominator === 0;
}

export function crossesBeatBoundary(start: Fraction, end: Fraction, beatDuration: Fraction): boolean {
  if (compareFractions(start, end) >= 0) return false;
  return beatIndexAt(start, beatDuration) !== beatIndexAt(subtractEpsilon(end), beatDuration);
}

export function hidesBeatBoundary(span: BeatBoundarySpan): boolean {
  return span.crossesBeat && !(span.startsOnBeat && span.endsOnBeat);
}

export function addFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}

export function compareFractions(left: Fraction, right: Fraction): number {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

function divideFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator,
    denominator: left.denominator * right.numerator,
  });
}

function subtractEpsilon(value: Fraction): Fraction {
  return reduceFraction({
    numerator: value.numerator * 1_000_000 - 1,
    denominator: value.denominator * 1_000_000,
  });
}
