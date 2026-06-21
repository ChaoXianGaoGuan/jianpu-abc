import type {
  Fraction,
  Measure,
  MusicalEvent,
  NoteEvent,
  RestEvent,
  Score,
  Voice,
} from "./ast";
import { reduceFraction } from "./fraction";
import {
  addFractions,
  beatDurationForMeter,
  beatIndexAt,
  compareFractions,
  eventTimeSpans,
  hidesBeatBoundary,
  type EventTimeSpan,
} from "./rhythm";

export function toBeatClearScore(score: Score): Score {
  const beatDuration = beatDurationForMeter(
    score.header.meter,
    score.header.defaultNoteLength,
  );
  return {
    ...score,
    voices: score.voices.map((voice) => toBeatClearVoice(voice, beatDuration)),
  };
}

function toBeatClearVoice(voice: Voice, beatDuration: Fraction): Voice {
  return {
    ...voice,
    measures: voice.measures.map((measure) => toBeatClearMeasure(measure, beatDuration)),
  };
}

function toBeatClearMeasure(measure: Measure, beatDuration: Fraction): Measure {
  const spans = eventTimeSpans(measure, beatDuration);
  const events = spans.flatMap((span) => toBeatClearEvents(span, beatDuration));
  return events === measure.events ? measure : { ...measure, events };
}

function toBeatClearEvents(span: EventTimeSpan, beatDuration: Fraction): MusicalEvent[] {
  const event = span.event;
  if (!isSplittableTimedEvent(event)) return [event];
  if (event.tuplet) return [event];
  if (!hidesBeatBoundary(span)) return [event];
  const durations = splitSpanDurations(span, beatDuration);
  if (durations.length <= 1) return [event];
  return event.type === "note"
    ? splitNoteEvent(event, durations)
    : splitRestEvent(event, durations);
}

function isSplittableTimedEvent(event: MusicalEvent): event is NoteEvent | RestEvent {
  return event.type === "note" || event.type === "rest";
}

function splitNoteEvent(note: NoteEvent, durations: Fraction[]): NoteEvent[] {
  const lastIndex = durations.length - 1;
  return durations.map((duration, index) => {
    const copy: NoteEvent = { ...note, duration };
    delete copy.dots;
    delete copy.sourceText;
    if (index !== 0) delete copy.lyric;

    const tieEnd = index === 0 ? note.tieEnd : true;
    if (tieEnd) copy.tieEnd = true;
    else delete copy.tieEnd;

    const tieStart = index === lastIndex ? note.tieStart : true;
    if (tieStart) copy.tieStart = true;
    else delete copy.tieStart;

    if (index !== 0) delete copy.slurStart;
    if (index !== lastIndex) delete copy.slurEnd;
    return copy;
  });
}

function splitRestEvent(rest: RestEvent, durations: Fraction[]): RestEvent[] {
  return durations.map((duration) => {
    const copy: RestEvent = { ...rest, duration };
    delete copy.dots;
    delete copy.sourceText;
    return copy;
  });
}

function splitSpanDurations(span: EventTimeSpan, beatDuration: Fraction): Fraction[] {
  const output: Fraction[] = [];
  let segmentStart = span.start;
  let boundary = nextBeatBoundaryAfter(span.start, beatDuration);
  while (compareFractions(boundary, span.end) < 0) {
    output.push(subtractFractions(boundary, segmentStart));
    segmentStart = boundary;
    boundary = addFractions(boundary, beatDuration);
  }
  output.push(subtractFractions(span.end, segmentStart));
  return output;
}

function nextBeatBoundaryAfter(time: Fraction, beatDuration: Fraction): Fraction {
  return multiplyFraction(beatDuration, beatIndexAt(time, beatDuration) + 1);
}

function multiplyFraction(value: Fraction, multiplier: number): Fraction {
  return reduceFraction({
    numerator: value.numerator * multiplier,
    denominator: value.denominator,
  });
}

function subtractFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator - right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}
