import type { Score } from "./ast";

export function normalizeScore(score: Score): Score {
  return attachLyrics(score);
}

export function attachLyrics(score: Score): Score {
  return {
    ...score,
    voices: score.voices.map((voice) => {
      const syllables = voice.lyricLines[0]?.syllables ?? [];
      let lyricIndex = 0;

      return {
        ...voice,
        measures: voice.measures.map((measure) => ({
          ...measure,
          events: measure.events.map((event) => {
            if (event.type !== "note") return { ...event };

            const lyric = syllables[lyricIndex];
            lyricIndex += 1;
            return lyric === undefined ? { ...event } : { ...event, lyric };
          }),
        })),
      };
    }),
  };
}
