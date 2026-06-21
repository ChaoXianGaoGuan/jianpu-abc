import type { Measure, MusicalEvent, NoteEvent, Score } from "./ast";

interface LyricTarget {
  event: NoteEvent;
}

export function normalizeScore(score: Score): Score {
  return attachLyrics(score);
}

export function attachLyrics(score: Score): Score {
  return {
    ...score,
    voices: score.voices.map((voice) => {
      const measures = voice.measures.map((measure) => ({
        ...measure,
        events: measure.events.map((event) => cloneEventWithoutLyric(event)),
      }));
      const targetsByLine = lyricTargetsByLine(measures);
      const targetedLines = new Set<number>();

      for (const lyricLine of voice.lyricLines) {
        const targetLine = previousUntargetedMusicLine(
          targetsByLine,
          targetedLines,
          lyricLine.line,
        );
        if (targetLine === undefined) continue;
        targetedLines.add(targetLine);
        const targets = targetsByLine.get(targetLine) ?? [];
        for (const [index, target] of targets.entries()) {
          const syllable = lyricLine.syllables[index];
          if (syllable === undefined || syllable === "*") continue;
          target.event.lyric = syllable;
        }
      }

      return {
        ...voice,
        measures,
      };
    }),
  };
}

function cloneEventWithoutLyric(event: MusicalEvent): MusicalEvent {
  if (event.type !== "note") return { ...event };
  const copy: NoteEvent = { ...event };
  delete copy.lyric;
  return copy;
}

function lyricTargetsByLine(measures: Measure[]): Map<number, LyricTarget[]> {
  const targetsByLine = new Map<number, LyricTarget[]>();
  let tieOpen = false;
  let slurOpen = false;

  for (const measure of measures) {
    for (const event of measure.events) {
      if (event.type === "extension") continue;
      if (event.type !== "note") continue;

      const startsTarget = !tieOpen && !slurOpen && !event.tieEnd;
      const line = event.location?.line;
      if (startsTarget && line !== undefined) {
        const targets = targetsByLine.get(line) ?? [];
        targets.push({ event });
        targetsByLine.set(line, targets);
      }

      tieOpen = event.tieStart === true;
      if (event.slurStart) slurOpen = true;
      if (event.slurEnd) slurOpen = false;
    }
  }

  return targetsByLine;
}

function previousUntargetedMusicLine(
  targetsByLine: Map<number, LyricTarget[]>,
  targetedLines: Set<number>,
  lyricLine: number,
): number | undefined {
  const candidateLines = [...targetsByLine.keys()]
    .filter((line) => line < lyricLine)
    .sort((left, right) => right - left);
  const nearestLine = candidateLines[0];
  return nearestLine !== undefined && !targetedLines.has(nearestLine)
    ? nearestLine
    : undefined;
}
