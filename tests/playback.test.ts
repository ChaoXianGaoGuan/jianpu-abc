import { describe, expect, it, vi } from "vitest";
import { parseJabc } from "../src/core/parser";
import {
  expandMeasureOrder,
  PlaybackBuildError,
  prependCountIn,
  scoreToPlaybackEvents,
  scoreToPlaybackPlan,
} from "../src/playback/events";
import { midiToFrequency, WebAudioPlayer } from "../src/playback/web-audio-player";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe("scoreToPlaybackEvents", () => {
  it.each([
    ["4/4", "1/4=120", 4, 2],
    ["3/4", "1/4=120", 3, 1.5],
    ["6/8", "3/8=60", 2, 2],
    ["9/8", "3/8=60", 3, 3],
    ["12/8", "3/8=60", 4, 4],
  ])("prepends one full count-in measure for %s", (meter, tempo, clickCount, duration) => {
    const plan = scoreToPlaybackPlan(parse(
      `M:${meter}\nL:1/8\nQ:${tempo}\nK:C jianpu\n| 1e 2e |`,
    ));
    const counted = prependCountIn(plan);

    expect(counted.metronomeEvents.slice(0, clickCount)).toHaveLength(clickCount);
    expect(counted.metronomeEvents[0]).toEqual({ startTime: 0, accent: true });
    expect(counted.metronomeEvents.slice(1, clickCount).every((event) => !event.accent)).toBe(true);
    expect(counted.events[0]?.startTime).toBeCloseTo((plan.events[0]?.startTime ?? 0) + duration);
    expect(counted.duration).toBeCloseTo(plan.duration + duration);
  });

  it("returns a shifted copy without mutating the source plan", () => {
    const plan = scoreToPlaybackPlan(parse(
      "M:4/4\nL:1/4\nQ:1/4=120\nK:C jianpu\n| 1 2 3 4 |",
    ));
    const original = structuredClone(plan);
    const counted = prependCountIn(plan);

    expect(plan).toEqual(original);
    expect(counted).not.toBe(plan);
    expect(counted.events[0]?.startTime).toBe(2);
    expect(counted.metronomeEvents.slice(0, 4)).toEqual([
      { startTime: 0, accent: true },
      { startTime: 0.5, accent: false },
      { startTime: 1, accent: false },
      { startTime: 1.5, accent: false },
    ]);
    expect(counted.metronomeEvents[4]).toEqual({ startTime: 2, accent: true });
  });

  it("rejects invalid count-in measure counts", () => {
    const plan = scoreToPlaybackPlan(parse("K:C jianpu\n| 1 |"));
    expect(() => prependCountIn(plan, -1)).toThrow(/non-negative integer/);
    expect(() => prependCountIn(plan, 0.5)).toThrow(/non-negative integer/);
  });

  it("builds accented metronome pulses and preserves trailing-rest duration", () => {
    const plan = scoreToPlaybackPlan(parse(
      "M:4/4\nL:1/4\nQ:1/4=120\nK:C jianpu\n| 1 2 3 4 | 1 0 0 0 |",
    ));

    expect(plan.metronomeEvents).toEqual([
      { startTime: 0, accent: true },
      { startTime: 0.5, accent: false },
      { startTime: 1, accent: false },
      { startTime: 1.5, accent: false },
      { startTime: 2, accent: true },
      { startTime: 2.5, accent: false },
      { startTime: 3, accent: false },
      { startTime: 3.5, accent: false },
    ]);
    expect(plan.duration).toBe(4);
    expect(Math.max(...plan.events.map((event) => event.startTime + event.duration))).toBe(2.5);
  });

  it.each([
    ["6/8", 2],
    ["9/8", 3],
    ["12/8", 4],
  ])("uses compound main beats for %s", (meter, expectedClicks) => {
    const numerator = Number(meter.split("/")[0]);
    const notes = Array.from({ length: numerator }, () => "1e").join(" ");
    const plan = scoreToPlaybackPlan(parse(
      `M:${meter}\nL:1/8\nQ:3/8=60\nK:C jianpu\n| ${notes} |`,
    ));

    expect(plan.metronomeEvents).toHaveLength(expectedClicks);
    expect(plan.metronomeEvents[0]).toEqual({ startTime: 0, accent: true });
    expect(plan.metronomeEvents.slice(1).every((event) => !event.accent)).toBe(true);
  });

  it("uses manual meter and tempo fallbacks when headers are absent", () => {
    const plan = scoreToPlaybackPlan(parse("L:1/4\nK:C jianpu\n| 1 2 3 |"), {
      defaultMeter: { numerator: 3, denominator: 4 },
      defaultTempo: { beat: { numerator: 1, denominator: 4 }, bpm: 90 },
    });

    expect(plan.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(plan.tempo).toEqual({ beat: { numerator: 1, denominator: 4 }, bpm: 90 });
    expect(plan.metronomeEvents).toHaveLength(3);
  });

  it("restarts the metronome accent at repeated and pickup measure boundaries", () => {
    const plan = scoreToPlaybackPlan(parse(
      "M:4/4\nL:1/4\nQ:1/4=120\nK:C jianpu\n|: 1 | 1 2 3 4 :|",
    ));

    expect(plan.metronomeEvents.filter((event) => event.accent).map((event) => event.startTime))
      .toEqual([0, 0.5, 2.5, 3]);
  });

  it("maps pitch, start time, duration, and velocity", () => {
    const events = scoreToPlaybackEvents(
      parse("L:1/4\nQ:1/4=120\nK:D jianpu\n| 1 2 3 |"),
      { velocity: 80 },
    );

    expect(events).toMatchObject([
      { midi: 62, startTime: 0, duration: 0.5, velocity: 80 },
      { midi: 64, startTime: 0.5, duration: 0.5, velocity: 80 },
      { midi: 66, startTime: 1, duration: 0.5, velocity: 80 },
    ]);
    expect(events[0]?.sourceEventId).toBe("default:0:0");
  });

  it("advances through rests without generating note events", () => {
    const events = scoreToPlaybackEvents(parse("K:C jianpu\n| 1 0 2 |"));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ midi: 60, startTime: 0, duration: 0.5 });
    expect(events[1]).toMatchObject({ midi: 62, startTime: 1, duration: 0.5 });
  });

  it("extends the preceding note for every dash", () => {
    const events = scoreToPlaybackEvents(parse("K:C jianpu\n| 1 - - 2 |"));

    expect(events[0]).toMatchObject({ startTime: 0, duration: 1.5 });
    expect(events[1]).toMatchObject({ startTime: 1.5, duration: 0.5 });
  });

  it("schedules triplet durations", () => {
    const events = scoreToPlaybackEvents(parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| (3 1 2 3 |"));

    expect(events).toMatchObject([
      { midi: 60, startTime: 0, duration: 1 / 3 },
      { midi: 62, startTime: 1 / 3, duration: 1 / 3 },
      { midi: 64, startTime: 2 / 3, duration: 1 / 3 },
    ]);
  });

  it("expands simple repeats during scheduling", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n|: 1 2 :| 3 |");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 0, 1]);
    expect(scoreToPlaybackEvents(score).map((event) => event.midi)).toEqual([60, 62, 60, 62, 64]);
  });

  it("expands first and second endings during scheduling", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n|: 1 [1 2 :| [2 3 |]");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 1, 0, 2]);
    expect(scoreToPlaybackEvents(score).map((event) => event.midi)).toEqual([60, 62, 60, 64]);
  });

  it("expands D.C. playback until Fine", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| 1 | 2 !fine! | 3 !D.C.! |");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 1, 2, 0, 1]);
    expect(scoreToPlaybackEvents(score).map((event) => event.midi)).toEqual([60, 62, 64, 60, 62]);
  });

  it("expands D.S. playback from Segno until Fine", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| 1 | !segno! 2 | 3 !fine! | 4 !D.S.! |");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 1, 2, 3, 1, 2]);
    expect(scoreToPlaybackEvents(score).map((event) => event.midi)).toEqual([60, 62, 64, 65, 62, 64]);
  });

  it("expands D.S. playback to Coda", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| 1 | !segno! 2 | !coda! 3 | 4 !D.S.! | !coda! 5 |");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 1, 2, 3, 1, 4]);
    expect(scoreToPlaybackEvents(score).map((event) => event.midi)).toEqual([60, 62, 64, 65, 62, 67]);
  });

  it("expands D.C. playback to Coda", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| 1 | !coda! 2 | 3 !D.C.! | !coda! 5 |");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 1, 2, 0, 3]);
    expect(scoreToPlaybackEvents(score).map((event) => event.midi)).toEqual([60, 62, 64, 60, 67]);
  });

  it("ends a first-ending-only tie when repeat playback branches to the second ending", () => {
    const score = parse("L:1/4\nQ:1/4=120\nK:C jianpu\n|: 1~ | [1 ~1 :| [2 2 |]");

    expect(expandMeasureOrder(score.voices[0]?.measures ?? [])).toEqual([0, 1, 0, 2]);
    expect(scoreToPlaybackEvents(score)).toMatchObject([
      { midi: 60, startTime: 0, duration: 1 },
      { midi: 60, startTime: 1, duration: 0.5 },
      { midi: 62, startTime: 1.5, duration: 0.5 },
    ]);
  });

  it("uses the tempo beat instead of assuming a quarter-note beat", () => {
    const events = scoreToPlaybackEvents(parse("L:1/4\nQ:1/8=60\nK:C jianpu\n| 1 |"));

    expect(events[0]?.duration).toBe(2);
  });

  it("uses absolute duration letters for playback timing", () => {
    const events = scoreToPlaybackEvents(parse("L:1/2\nQ:1/4=120\nK:C jianpu\n| 1q 2e 3s |"));

    expect(events).toMatchObject([
      { midi: 60, startTime: 0, duration: 0.5 },
      { midi: 62, startTime: 0.5, duration: 0.25 },
      { midi: 64, startTime: 0.75, duration: 0.125 },
    ]);
  });

  it("applies inline key changes during playback", () => {
    const events = scoreToPlaybackEvents(parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| 1 [K:G jianpu] 1 |"));

    expect(events).toMatchObject([
      { midi: 60, startTime: 0, duration: 0.5 },
      { midi: 67, startTime: 0.5, duration: 0.5 },
    ]);
  });

  it("plays parsed octave, accidental, and dotted duration syntax", () => {
    const events = scoreToPlaybackEvents(parse("L:1/4\nQ:1/4=120\nK:C jianpu\n| 1' #4 1, 3. |"));

    expect(events).toMatchObject([
      { midi: 72, startTime: 0, duration: 0.5 },
      { midi: 66, startTime: 0.5, duration: 0.5 },
      { midi: 48, startTime: 1, duration: 0.5 },
      { midi: 64, startTime: 1.5, duration: 0.75 },
    ]);
  });

  it("merges tied notes across measures without retriggering", () => {
    const score = parse("K:C jianpu\n| 1 | 1 |");
    const first = score.voices[0]?.measures[0]?.events[0];
    const second = score.voices[0]?.measures[1]?.events[0];
    if (first?.type !== "note" || second?.type !== "note") throw new Error("Expected notes");
    first.tieStart = true;
    second.tieEnd = true;

    expect(scoreToPlaybackEvents(score)).toMatchObject([
      { midi: 60, startTime: 0, duration: 1 },
    ]);
  });

  it("rejects ties whose pitches do not match", () => {
    const score = parse("K:C jianpu\n| 1 | 2 |");
    const first = score.voices[0]?.measures[0]?.events[0];
    const second = score.voices[0]?.measures[1]?.events[0];
    if (first?.type !== "note" || second?.type !== "note") throw new Error("Expected notes");
    first.tieStart = true;
    second.tieEnd = true;

    expect(() => scoreToPlaybackEvents(score)).toThrowError(PlaybackBuildError);
    try {
      scoreToPlaybackEvents(score);
    } catch (error) {
      expect(error).toMatchObject({ code: "TIE_PITCH_MISMATCH" });
    }
  });

  it("schedules multiple voices in parallel", () => {
    const events = scoreToPlaybackEvents(parse(`L:1/4\nQ:1/4=120\nK:C jianpu\nV:melody\n| 1 2 |\nV:bass\n| 1, - |`));

    expect(events).toMatchObject([
      { midi: 48, startTime: 0, duration: 1, sourceEventId: "bass:0:0" },
      { midi: 60, startTime: 0, duration: 0.5, sourceEventId: "melody:0:0" },
      { midi: 62, startTime: 0.5, duration: 0.5, sourceEventId: "melody:0:1" },
    ]);
  });

  it("reports extensions that do not follow a note", () => {
    const score = parse("K:C jianpu\n| - 1 |");

    expect(() => scoreToPlaybackEvents(score)).toThrow(/must follow a note/);
  });

  it("requires a key", () => {
    expect(() => scoreToPlaybackEvents(parse("| 1 |"))).toThrow(/without a JABC K: field/);
  });
});

describe("WebAudioPlayer", () => {
  it("converts MIDI pitch to equal-tempered frequency", () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 4);
  });

  it("schedules notes and supports pause, resume, and stop", () => {
    const frequency = { setValueAtTime: vi.fn() };
    const oscillator = {
      type: "sine" as OscillatorType,
      frequency,
      detune: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const gainParam = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
    const gain = {
      gain: gainParam,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      currentTime: 10,
      state: "running",
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const player = new WebAudioPlayer(context, { instrument: "synth", scheduleAheadSeconds: 0 });
    const event = {
      id: "playback-1",
      type: "note" as const,
      midi: 69,
      startTime: 0,
      duration: 1,
      velocity: 100,
    };

    player.play([event]);
    expect(player.playbackState).toBe("playing");
    expect(frequency.setValueAtTime).toHaveBeenCalledWith(440, 10);

    (context as unknown as { currentTime: number }).currentTime = 10.25;
    player.pause();
    expect(player.playbackState).toBe("paused");
    expect(player.currentTime).toBeCloseTo(0.25);

    player.resume();
    expect(player.playbackState).toBe("playing");
    player.stop();
    expect(player.playbackState).toBe("idle");
    expect(player.currentTime).toBe(0);
  });

  it("starts playback from a requested offset", () => {
    const oscillators: Array<{
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const createOscillator = vi.fn(() => {
      const oscillator = {
        type: "sine" as OscillatorType,
        frequency: { setValueAtTime: vi.fn() },
        detune: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    });
    const context = {
      currentTime: 5,
      state: "running",
      destination: {},
      createOscillator,
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const player = new WebAudioPlayer(context, { instrument: "synth", scheduleAheadSeconds: 0 });

    player.play([
      { id: "playback-1", type: "note", midi: 60, startTime: 0, duration: 1, velocity: 100 },
      { id: "playback-2", type: "note", midi: 62, startTime: 2, duration: 1, velocity: 100 },
    ], {
      metronomeEvents: [
        { startTime: 0, accent: true },
        { startTime: 2, accent: false },
      ],
      totalDuration: 3,
      startTime: 1.5,
    });

    expect(player.currentTime).toBeCloseTo(1.5);
    expect(createOscillator).toHaveBeenCalledTimes(2);
    expect(oscillators[0]?.start).toHaveBeenCalledWith(5.5);
    expect(oscillators[1]?.start).toHaveBeenCalledWith(5.5);
  });

  it("delays highlight callbacks by audio output latency", () => {
    vi.useFakeTimers();
    try {
      const oscillator = {
        type: "sine" as OscillatorType,
        frequency: { setValueAtTime: vi.fn() },
        detune: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
      };
      const gain = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      const context = {
        currentTime: 10,
        outputLatency: 0.08,
        state: "running",
        destination: {},
        createOscillator: vi.fn(() => oscillator),
        createGain: vi.fn(() => gain),
        resume: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      } as unknown as AudioContext;
      const onEventStart = vi.fn();
      const player = new WebAudioPlayer(context, {
        instrument: "synth",
        scheduleAheadSeconds: 0,
        onEventStart,
      });
      const event = {
        id: "playback-1",
        type: "note" as const,
        midi: 69,
        startTime: 0,
        duration: 1,
        velocity: 100,
      };

      player.play([event]);

      expect(oscillator.start).toHaveBeenCalledWith(10);
      expect(onEventStart).not.toHaveBeenCalled();
      vi.advanceTimersByTime(79);
      expect(onEventStart).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onEventStart).toHaveBeenCalledWith(event);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("waits for audio readiness before scheduling notes and highlights", async () => {
    let resumeContext: (() => void) | undefined;
    const resumePromise = new Promise<void>((resolve) => {
      resumeContext = resolve;
    });
    const oscillator = {
      type: "sine" as OscillatorType,
      frequency: { setValueAtTime: vi.fn() },
      detune: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      currentTime: 10,
      state: "suspended",
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      resume: vi.fn(() => resumePromise),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const onEventStart = vi.fn();
    const player = new WebAudioPlayer(context, {
      instrument: "synth",
      scheduleAheadSeconds: 0,
      onEventStart,
    });
    const event = {
      id: "playback-1",
      type: "note" as const,
      midi: 69,
      startTime: 0,
      duration: 1,
      velocity: 100,
    };

    player.play([event]);
    expect(player.playbackState).toBe("loading");
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(onEventStart).not.toHaveBeenCalled();

    resumeContext?.();
    await vi.waitFor(() => expect(context.createOscillator).toHaveBeenCalled());
    expect(player.playbackState).toBe("playing");
  });

  it("uses decoded samples when they are available", async () => {
    const originalFetch = globalThis.fetch;
    const audioBuffer = { duration: 1 } as AudioBuffer;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const bufferSource = {
      buffer: null as AudioBuffer | null,
      playbackRate: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      currentTime: 10,
      state: "running",
      destination: {},
      createOscillator: vi.fn(),
      createBufferSource: vi.fn(() => bufferSource),
      createGain: vi.fn(() => gain),
      decodeAudioData: vi.fn(async () => audioBuffer),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const player = new WebAudioPlayer(context, {
      instrument: "piano",
      sampleBaseUrl: "https://samples.example.test",
      scheduleAheadSeconds: 0,
    });
    const event = {
      id: "playback-1",
      type: "note" as const,
      midi: 60,
      startTime: 0,
      duration: 1,
      velocity: 100,
    };

    try {
      player.play([event]);
      await vi.waitFor(() => expect(context.createBufferSource).toHaveBeenCalled());

      expect(fetchMock).toHaveBeenCalledWith("https://samples.example.test/piano/C3.mp3");
      expect(bufferSource.buffer).toBe(audioBuffer);
      expect(bufferSource.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 10);
      expect(context.createOscillator).not.toHaveBeenCalled();
      player.stop();
    } finally {
      if (originalFetch === undefined) {
        vi.unstubAllGlobals();
      } else {
        vi.stubGlobal("fetch", originalFetch);
      }
    }
  });

  it("supports piano and guitar instrument presets", () => {
    const oscillators: Array<{ stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    const createOscillator = vi.fn(() => {
      const oscillator = {
        type: "sine" as OscillatorType,
        frequency: { setValueAtTime: vi.fn() },
        detune: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    });
    const createGain = vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }));
    const context = {
      currentTime: 10,
      state: "running",
      destination: {},
      createOscillator,
      createGain,
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const event = {
      id: "playback-1",
      type: "note" as const,
      midi: 69,
      startTime: 0,
      duration: 1,
      velocity: 100,
    };
    const player = new WebAudioPlayer(context, { instrument: "piano", scheduleAheadSeconds: 0 });

    player.play([event]);
    expect(player.currentInstrument).toBe("piano");
    expect(createOscillator).toHaveBeenCalledTimes(4);

    player.setInstrument("guitar");
    expect(player.playbackState).toBe("idle");
    player.play([event]);
    expect(player.currentInstrument).toBe("guitar");
    expect(createOscillator).toHaveBeenCalledTimes(7);
    expect(oscillators.some((oscillator) => oscillator.stop.mock.calls.length > 0)).toBe(true);
  });

  it("schedules accented metronome clicks and adjusts both output buses live", () => {
    const frequencies: Array<{ setValueAtTime: ReturnType<typeof vi.fn> }> = [];
    const oscillators: Array<{
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const createOscillator = vi.fn(() => {
      const frequency = { setValueAtTime: vi.fn() };
      const oscillator = {
        type: "sine" as OscillatorType,
        frequency,
        detune: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
      };
      frequencies.push(frequency);
      oscillators.push(oscillator);
      return oscillator;
    });
    const gainParams: Array<{
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    }> = [];
    const createGain = vi.fn(() => {
      const gain = {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      };
      gainParams.push(gain);
      return { gain, connect: vi.fn(), disconnect: vi.fn() };
    });
    const context = {
      currentTime: 4,
      state: "running",
      destination: {},
      createOscillator,
      createGain,
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const player = new WebAudioPlayer(context, {
      instrument: "synth",
      masterGain: 0.2,
      metronomeGain: 0.3,
      scheduleAheadSeconds: 0,
    });

    player.setInstrumentVolume(0.6);
    player.setMetronomeVolume(0.4);
    player.setMetronomeEnabled(false);
    player.setMetronomeEnabled(true);
    expect(gainParams[0]?.setValueAtTime).toHaveBeenLastCalledWith(0.6, 4);
    expect(gainParams[1]?.setValueAtTime).toHaveBeenNthCalledWith(2, 0.4, 4);
    expect(gainParams[1]?.setValueAtTime).toHaveBeenNthCalledWith(3, 0, 4);
    expect(gainParams[1]?.setValueAtTime).toHaveBeenLastCalledWith(0.4, 4);

    player.play([{
      id: "playback-1",
      type: "note",
      midi: 69,
      startTime: 0,
      duration: 1,
      velocity: 100,
    }], {
      metronomeEvents: [
        { startTime: 0, accent: true },
        { startTime: 0.5, accent: false },
      ],
      totalDuration: 1,
    });

    expect(frequencies.map((frequency) => frequency.setValueAtTime.mock.calls[0]?.[0]))
      .toEqual([440, 1500, 1000]);
    expect(oscillators[0]?.start).toHaveBeenCalledWith(4);
    expect(oscillators[1]?.start).toHaveBeenCalledWith(4);
    expect(oscillators[2]?.start).toHaveBeenCalledWith(4.5);
    player.stop();
    expect(oscillators.every((oscillator) => oscillator.stop.mock.calls.length > 0)).toBe(true);
  });
});
