import type { Fraction, MusicalEvent, Score, TimeSignature } from "../core/ast";
import {
  analyzeMeasureRhythm,
  type EventTimeSpan,
} from "../core/rhythm";

const MAX_WARNINGS = 12;

export function rhythmWarningMessages(
  score: Score,
  fallbackMeter?: TimeSignature,
): string[] {
  const meter = score.header.meter ?? fallbackMeter;
  if (!meter) return [];

  const output: string[] = [];
  let hiddenCount = 0;
  for (const voice of score.voices) {
    for (const [measureIndex, measure] of voice.measures.entries()) {
      const rhythm = analyzeMeasureRhythm(measure, meter, score.header.defaultNoteLength);
      pushWarning(output, () => {
        if (rhythm.isComplete) return undefined;
        const relation = rhythm.isUnderfull ? "少于" : "超过";
        return `${voicePrefix(score, voice.id)}第 ${measureIndex + 1} 小节：总时值 ${formatFraction(rhythm.actualDuration)} ${relation}拍号需要的 ${formatFraction(rhythm.expectedDuration)}。`;
      }, () => { hiddenCount += 1; });

      for (const span of rhythm.spans) {
        pushWarning(output, () => crossBeatWarning(score, voice.id, measureIndex, span), () => { hiddenCount += 1; });
      }
    }
  }

  if (hiddenCount > 0) output.push(`还有 ${hiddenCount} 个节奏提示未显示。`);
  return output;
}

function crossBeatWarning(
  score: Score,
  voiceId: string,
  measureIndex: number,
  span: EventTimeSpan,
): string | undefined {
  if (!isTimedNoteOrRest(span.event)) return undefined;
  if (!span.crossesBeat || (span.startsOnBeat && span.endsOnBeat)) return undefined;
  return `${voicePrefix(score, voiceId)}第 ${measureIndex + 1} 小节第 ${span.eventIndex + 1} 个事件 ${eventLabel(span.event)} 跨过拍点；若需要每拍更清楚，可考虑用延音线或分拍写法。`;
}

function pushWarning(
  output: string[],
  build: () => string | undefined,
  onHidden: () => void,
): void {
  const message = build();
  if (!message) return;
  if (output.length < MAX_WARNINGS) output.push(message);
  else onHidden();
}

function isTimedNoteOrRest(event: MusicalEvent): boolean {
  return event.type === "note" || event.type === "rest";
}

function eventLabel(event: MusicalEvent): string {
  return event.sourceText ? `“${event.sourceText}”` : event.type;
}

function voicePrefix(score: Score, voiceId: string): string {
  return score.voices.length > 1 ? `声部 ${voiceId} ` : "";
}

function formatFraction(value: Fraction): string {
  return `${value.numerator}/${value.denominator}`;
}
