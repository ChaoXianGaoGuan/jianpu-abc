import type { MetronomeEvent, PlaybackEvent } from "./events";

export type PlaybackState = "idle" | "loading" | "playing" | "paused";
export type InstrumentId = "synth" | "piano" | "guitar";

export interface WebAudioPlayerOptions {
  masterGain?: number;
  metronomeGain?: number;
  metronomeEnabled?: boolean;
  oscillatorType?: OscillatorType;
  instrument?: InstrumentId;
  sampleBaseUrl?: string;
  scheduleAheadSeconds?: number;
  onEventStart?: (event: PlaybackEvent | null) => void;
  onStateChange?: (state: PlaybackState) => void;
}

export interface WebAudioPlayOptions {
  metronomeEvents?: MetronomeEvent[];
  totalDuration?: number;
  startTime?: number;
}

interface ScheduledVoice {
  stop(): void;
  disconnect(): void;
}

interface PartialTone {
  ratio: number;
  gain: number;
  type: OscillatorType;
  detune?: number;
}

interface SampleManifest {
  directory: string;
  notes: string[];
}

const DEFAULT_SAMPLE_BASE_URL = "https://nbrosowsky.github.io/tonejs-instruments/samples";

const SAMPLE_MANIFESTS: Record<Exclude<InstrumentId, "synth">, SampleManifest> = {
  piano: {
    directory: "piano",
    notes: ["C3", "E3", "G3", "C4", "E4", "G4", "C5", "E5", "G5"],
  },
  guitar: {
    directory: "guitar-acoustic",
    notes: ["C3", "E3", "G3", "C4", "E4", "G4", "C5"],
  },
};

const NOTE_SEMITONES: Record<string, number> = {
  C: 0,
  Cs: 1,
  D: 2,
  Ds: 3,
  E: 4,
  F: 5,
  Fs: 6,
  G: 7,
  Gs: 8,
  A: 9,
  As: 10,
  B: 11,
};

export class WebAudioPlayer {
  private readonly context: AudioContext;
  private readonly ownsContext: boolean;
  private readonly options: Required<Pick<
    WebAudioPlayerOptions,
    "masterGain" | "metronomeGain" | "metronomeEnabled" | "oscillatorType" | "instrument" | "sampleBaseUrl" | "scheduleAheadSeconds"
  >> & Pick<WebAudioPlayerOptions, "onEventStart" | "onStateChange">;
  private readonly instrumentOutput: GainNode;
  private readonly metronomeOutput: GainNode;
  private events: PlaybackEvent[] = [];
  private metronomeEvents: MetronomeEvent[] = [];
  private voices: ScheduledVoice[] = [];
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private state: PlaybackState = "idle";
  private positionSeconds = 0;
  private anchorContextTime = 0;
  private totalDuration = 0;
  private playGeneration = 0;
  private readonly sampleBuffers = new Map<InstrumentId, Map<number, AudioBuffer>>();
  private readonly sampleLoading = new Map<InstrumentId, Promise<void>>();

  constructor(context?: AudioContext, options: WebAudioPlayerOptions = {}) {
    this.context = context ?? createAudioContext();
    this.ownsContext = context === undefined;
    this.options = {
      masterGain: options.masterGain ?? 0.2,
      metronomeGain: options.metronomeGain ?? 0.3,
      metronomeEnabled: options.metronomeEnabled ?? true,
      oscillatorType: options.oscillatorType ?? "sine",
      instrument: options.instrument ?? "guitar",
      sampleBaseUrl: options.sampleBaseUrl ?? DEFAULT_SAMPLE_BASE_URL,
      scheduleAheadSeconds: options.scheduleAheadSeconds ?? 0.03,
      ...(options.onEventStart ? { onEventStart: options.onEventStart } : {}),
      ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
    };

    validateInstrument(this.options.instrument);
    if (this.options.masterGain < 0 || this.options.masterGain > 1) {
      throw new RangeError("masterGain must be between 0 and 1.");
    }
    if (this.options.metronomeGain < 0 || this.options.metronomeGain > 1) {
      throw new RangeError("metronomeGain must be between 0 and 1.");
    }
    if (this.options.scheduleAheadSeconds < 0) {
      throw new RangeError("scheduleAheadSeconds cannot be negative.");
    }

    this.instrumentOutput = this.context.createGain();
    this.metronomeOutput = this.context.createGain();
    this.instrumentOutput.connect(this.context.destination);
    this.metronomeOutput.connect(this.context.destination);
    setGain(this.instrumentOutput.gain, this.options.masterGain, this.context.currentTime);
    setGain(
      this.metronomeOutput.gain,
      this.options.metronomeEnabled ? this.options.metronomeGain : 0,
      this.context.currentTime,
    );
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get currentInstrument(): InstrumentId {
    return this.options.instrument;
  }

  get currentTime(): number {
    if (this.state !== "playing") return this.positionSeconds;
    return clamp(this.context.currentTime - this.anchorContextTime, 0, this.totalDuration);
  }

  setInstrument(instrument: InstrumentId): void {
    validateInstrument(instrument);
    if (this.options.instrument === instrument) return;
    this.stop();
    this.options.instrument = instrument;
    void this.prepareInstrument(instrument);
  }

  setInstrumentVolume(volume: number): void {
    validateGain(volume, "Instrument volume");
    this.options.masterGain = volume;
    setGain(this.instrumentOutput.gain, volume, this.context.currentTime);
  }

  setMetronomeVolume(volume: number): void {
    validateGain(volume, "Metronome volume");
    this.options.metronomeGain = volume;
    if (this.options.metronomeEnabled) {
      setGain(this.metronomeOutput.gain, volume, this.context.currentTime);
    }
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.options.metronomeEnabled = enabled;
    setGain(
      this.metronomeOutput.gain,
      enabled ? this.options.metronomeGain : 0,
      this.context.currentTime,
    );
  }

  play(events: PlaybackEvent[], playbackOptions: WebAudioPlayOptions = {}): void {
    this.cancelScheduled();
    const generation = ++this.playGeneration;
    this.events = [...events].sort((left, right) => left.startTime - right.startTime);
    this.metronomeEvents = [...(playbackOptions.metronomeEvents ?? [])]
      .sort((left, right) => left.startTime - right.startTime);
    const eventDuration = this.events.reduce(
      (latest, event) => Math.max(latest, event.startTime + event.duration),
      0,
    );
    const metronomeDuration = this.metronomeEvents.reduce(
      (latest, event) => Math.max(latest, event.startTime + 0.045),
      0,
    );
    this.totalDuration = Math.max(
      eventDuration,
      metronomeDuration,
      playbackOptions.totalDuration ?? 0,
    );
    const startTime = clamp(playbackOptions.startTime ?? 0, 0, this.totalDuration);
    this.positionSeconds = startTime;

    if (this.events.length === 0 && this.metronomeEvents.length === 0) {
      this.setState("idle");
      this.options.onEventStart?.(null);
      return;
    }

    const resume = this.context.state === "suspended" ? this.context.resume() : undefined;
    const preparation = this.events.length > 0
      ? this.prepareInstrument(this.options.instrument)
      : undefined;
    const readiness: Array<Promise<unknown>> = [];
    if (resume) readiness.push(resume);
    if (preparation) readiness.push(preparation);
    if (readiness.length > 0) {
      this.setState("loading");
      void Promise.allSettled(readiness).then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            console.warn("Could not prepare Web Audio playback before scheduling.", result.reason);
          }
        }
        if (
          generation === this.playGeneration
          && (this.events.length > 0 || this.metronomeEvents.length > 0)
        ) this.scheduleFrom(startTime);
      });
      return;
    }
    this.scheduleFrom(startTime);
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.positionSeconds = this.currentTime;
    this.cancelScheduled();
    this.setState("paused");
    this.options.onEventStart?.(null);
  }

  resume(): void {
    if (this.state !== "paused") return;
    if (this.positionSeconds >= this.totalDuration) {
      this.stop();
      return;
    }
    if (this.context.state === "suspended") void this.context.resume();
    this.scheduleFrom(this.positionSeconds);
  }

  stop(): void {
    this.playGeneration += 1;
    this.cancelScheduled();
    this.events = [];
    this.metronomeEvents = [];
    this.positionSeconds = 0;
    this.totalDuration = 0;
    this.setState("idle");
    this.options.onEventStart?.(null);
  }

  async dispose(): Promise<void> {
    this.stop();
    safeDisconnect(this.instrumentOutput);
    safeDisconnect(this.metronomeOutput);
    if (this.ownsContext && this.context.state !== "closed") {
      await this.context.close();
    }
  }

  private scheduleFrom(position: number): void {
    const startAt = this.context.currentTime + this.options.scheduleAheadSeconds;
    this.anchorContextTime = startAt - position;
    this.positionSeconds = position;
    this.setState("playing");
    const outputLatency = audioOutputLatencySeconds(this.context);

    for (const event of this.events) {
      const eventEnd = event.startTime + event.duration;
      if (eventEnd <= position) continue;

      const audibleStart = Math.max(event.startTime, position);
      const contextStart = this.anchorContextTime + audibleStart;
      const contextEnd = this.anchorContextTime + eventEnd;
      this.scheduleNote(event, contextStart, contextEnd);

      const startDelay = Math.max(0, contextStart + outputLatency - this.context.currentTime) * 1000;
      const endDelay = Math.max(0, contextEnd + outputLatency - this.context.currentTime) * 1000;
      this.timers.push(setTimeout(() => this.options.onEventStart?.(event), startDelay));
      this.timers.push(setTimeout(() => this.options.onEventStart?.(null), endDelay));
    }

    for (const event of this.metronomeEvents) {
      if (event.startTime < position) continue;
      this.scheduleMetronomeClick(event, this.anchorContextTime + event.startTime);
    }

    const completionDelay = Math.max(
      0,
      this.anchorContextTime + this.totalDuration + outputLatency - this.context.currentTime,
    ) * 1000;
    this.timers.push(setTimeout(() => {
      this.voices = [];
      this.timers = [];
      this.positionSeconds = this.totalDuration;
      this.setState("idle");
      this.options.onEventStart?.(null);
    }, completionDelay));
  }

  private scheduleNote(event: PlaybackEvent, start: number, end: number): void {
    const frequency = midiToFrequency(event.midi);
    const amplitude = event.velocity / 127;
    const duration = Math.max(0.01, end - start);
    const sampledVoice = this.scheduleSampledVoice(
      this.options.instrument,
      event.midi,
      amplitude,
      start,
      duration,
    );
    const voice = sampledVoice
      ?? (this.options.instrument === "piano"
        ? this.schedulePianoVoice(frequency, amplitude, start, duration)
        : this.options.instrument === "guitar"
          ? this.scheduleGuitarVoice(frequency, amplitude, start, duration)
          : this.scheduleSynthVoice(frequency, amplitude, start, duration));
    this.voices.push(voice);
  }

  private scheduleMetronomeClick(event: MetronomeEvent, start: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const stopAt = start + 0.045;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(event.accent ? 1500 : 1000, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(event.accent ? 0.75 : 0.5, start + 0.002);
    gain.gain.exponentialRampToValueAtTime?.(0.0001, stopAt);
    oscillator.connect(gain);
    gain.connect(this.metronomeOutput);
    oscillator.start(start);
    oscillator.stop(stopAt);
    oscillator.addEventListener("ended", () => {
      safeDisconnect(oscillator);
      safeDisconnect(gain);
    }, { once: true });
    this.voices.push({
      stop: () => {
        try {
          oscillator.stop();
        } catch {
          // The oscillator may already have ended.
        }
      },
      disconnect: () => {
        safeDisconnect(oscillator);
        safeDisconnect(gain);
      },
    });
  }

  private scheduleSampledVoice(
    instrument: InstrumentId,
    midi: number,
    amplitude: number,
    start: number,
    duration: number,
  ): ScheduledVoice | undefined {
    if (instrument === "synth") return undefined;
    const samples = this.sampleBuffers.get(instrument);
    if (!samples || samples.size === 0 || typeof this.context.createBufferSource !== "function") return undefined;
    const nearest = nearestSample(midi, samples);
    if (!nearest) return undefined;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const playbackRate = 2 ** ((midi - nearest.midi) / 12);
    const stopAt = start + Math.max(duration + 0.08, 0.16);
    const releaseStart = Math.max(start, stopAt - 0.08);

    source.buffer = nearest.buffer;
    source.playbackRate.setValueAtTime(playbackRate, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + 0.004);
    gain.gain.setValueAtTime(amplitude, releaseStart);
    gain.gain.linearRampToValueAtTime(0, stopAt);
    source.connect(gain);
    gain.connect(this.instrumentOutput);
    source.start(start);
    source.stop(stopAt);
    source.addEventListener("ended", () => {
      safeDisconnect(source);
      safeDisconnect(gain);
    }, { once: true });

    return {
      stop: () => {
        try {
          source.stop();
        } catch {
          // The source may already have ended.
        }
      },
      disconnect: () => {
        safeDisconnect(source);
        safeDisconnect(gain);
      },
    };
  }

  private scheduleSynthVoice(
    frequency: number,
    amplitude: number,
    start: number,
    duration: number,
  ): ScheduledVoice {
    const releaseStart = start + Math.max(0, duration - 0.01);
    return this.scheduleLayeredVoice({
      partials: [{ ratio: 1, gain: 1, type: this.options.oscillatorType }],
      frequency,
      amplitude,
      start,
      stopAt: start + duration,
      envelope: [
        { time: start, gain: amplitude },
        { time: releaseStart, gain: amplitude },
        { time: start + duration, gain: 0 },
      ],
    });
  }

  private schedulePianoVoice(
    frequency: number,
    amplitude: number,
    start: number,
    duration: number,
  ): ScheduledVoice {
    const stopAt = start + Math.max(duration + 0.08, 0.38);
    const attackEnd = start + Math.min(0.012, Math.max(0.004, duration * 0.1));
    const bodyEnd = Math.min(stopAt - 0.02, attackEnd + Math.max(0.08, duration * 0.45));
    return this.scheduleLayeredVoice({
      partials: [
        { ratio: 1, gain: 1, type: "sine" },
        { ratio: 2.01, gain: 0.22, type: "triangle", detune: -2 },
        { ratio: 3.02, gain: 0.12, type: "sine", detune: 3 },
        { ratio: 4, gain: 0.055, type: "triangle" },
      ],
      frequency,
      amplitude: amplitude * 0.9,
      start,
      stopAt,
      envelope: [
        { time: start, gain: 0 },
        { time: attackEnd, gain: amplitude * 0.9 },
        { time: bodyEnd, gain: amplitude * 0.24 },
        { time: stopAt, gain: 0 },
      ],
    });
  }

  private scheduleGuitarVoice(
    frequency: number,
    amplitude: number,
    start: number,
    duration: number,
  ): ScheduledVoice {
    const stopAt = start + Math.max(duration + 0.04, 0.28);
    const attackEnd = start + Math.min(0.006, Math.max(0.002, duration * 0.08));
    const bodyEnd = Math.min(stopAt - 0.018, attackEnd + Math.max(0.045, duration * 0.28));
    return this.scheduleLayeredVoice({
      partials: [
        { ratio: 1, gain: 0.95, type: "triangle" },
        { ratio: 2, gain: 0.26, type: "sawtooth", detune: -4 },
        { ratio: 3.01, gain: 0.12, type: "square", detune: 5 },
      ],
      frequency,
      amplitude: amplitude * 0.78,
      start,
      stopAt,
      envelope: [
        { time: start, gain: 0 },
        { time: attackEnd, gain: amplitude * 0.78 },
        { time: bodyEnd, gain: amplitude * 0.18 },
        { time: stopAt, gain: 0 },
      ],
    });
  }

  private scheduleLayeredVoice(options: {
    partials: PartialTone[];
    frequency: number;
    amplitude: number;
    start: number;
    stopAt: number;
    envelope: Array<{ time: number; gain: number }>;
  }): ScheduledVoice {
    const outputGain = this.context.createGain();
    applyEnvelope(outputGain.gain, options.envelope);
    outputGain.connect(this.instrumentOutput);

    const oscillators: OscillatorNode[] = [];
    const partialGains: GainNode[] = [];
    for (const partial of options.partials) {
      const oscillator = this.context.createOscillator();
      const partialGain = this.context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.setValueAtTime(options.frequency * partial.ratio, options.start);
      if (partial.detune !== undefined) oscillator.detune.setValueAtTime(partial.detune, options.start);
      partialGain.gain.setValueAtTime(partial.gain, options.start);
      oscillator.connect(partialGain);
      partialGain.connect(outputGain);
      oscillator.start(options.start);
      oscillator.stop(options.stopAt);
      oscillator.addEventListener("ended", () => {
        safeDisconnect(oscillator);
        safeDisconnect(partialGain);
      }, { once: true });
      oscillators.push(oscillator);
      partialGains.push(partialGain);
    }

    return {
      stop: () => {
        for (const oscillator of oscillators) {
          try {
            oscillator.stop();
          } catch {
            // The oscillator may already have ended.
          }
        }
      },
      disconnect: () => {
        for (const oscillator of oscillators) safeDisconnect(oscillator);
        for (const partialGain of partialGains) safeDisconnect(partialGain);
        safeDisconnect(outputGain);
      },
    };
  }

  private prepareInstrument(instrument: InstrumentId): Promise<void> | undefined {
    if (instrument === "synth") return undefined;
    if (this.sampleBuffers.has(instrument)) return undefined;
    const loading = this.sampleLoading.get(instrument);
    if (loading) return loading;
    if (typeof fetch !== "function" || typeof this.context.decodeAudioData !== "function") {
      return undefined;
    }

    const promise = this.loadInstrumentSamples(instrument)
      .catch((error: unknown) => {
        console.warn(`Could not load ${instrument} samples; using synthesized fallback.`, error);
      })
      .finally(() => {
        this.sampleLoading.delete(instrument);
      });
    this.sampleLoading.set(instrument, promise);
    return promise;
  }

  private async loadInstrumentSamples(instrument: Exclude<InstrumentId, "synth">): Promise<void> {
    const manifest = SAMPLE_MANIFESTS[instrument];
    const buffers = new Map<number, AudioBuffer>();
    await Promise.all(manifest.notes.map(async (note) => {
      const midi = noteNameToMidi(note);
      const url = `${this.options.sampleBaseUrl}/${manifest.directory}/${note}.mp3`;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        buffers.set(midi, await this.context.decodeAudioData(arrayBuffer));
      } catch (error) {
        console.warn(`Could not load sample ${note} for ${instrument}.`, error);
      }
    }));
    if (buffers.size > 0) this.sampleBuffers.set(instrument, buffers);
  }

  private cancelScheduled(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices = [];
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}

export function midiToFrequency(midi: number): number {
  if (!Number.isFinite(midi)) throw new RangeError("MIDI pitch must be finite.");
  return 440 * 2 ** ((midi - 69) / 12);
}

function validateGain(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
}

function setGain(param: AudioParam, value: number, time: number): void {
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, time);
  else param.value = value;
}

function nearestSample(
  midi: number,
  samples: Map<number, AudioBuffer>,
): { midi: number; buffer: AudioBuffer } | undefined {
  let best: { midi: number; buffer: AudioBuffer; distance: number } | undefined;
  for (const [sampleMidi, buffer] of samples.entries()) {
    const distance = Math.abs(sampleMidi - midi);
    if (!best || distance < best.distance) best = { midi: sampleMidi, buffer, distance };
  }
  return best ? { midi: best.midi, buffer: best.buffer } : undefined;
}

function noteNameToMidi(note: string): number {
  const match = /^(C|Cs|D|Ds|E|F|Fs|G|Gs|A|As|B)(\d)$/.exec(note);
  if (!match) throw new Error(`Unsupported sample note name: ${note}`);
  const [, step, octaveText] = match;
  const semitone = NOTE_SEMITONES[step as keyof typeof NOTE_SEMITONES];
  if (semitone === undefined || octaveText === undefined) {
    throw new Error(`Unsupported sample note name: ${note}`);
  }
  return (Number(octaveText) + 1) * 12 + semitone;
}

function applyEnvelope(
  gain: AudioParam,
  points: Array<{ time: number; gain: number }>,
): void {
  const ordered = [...points].sort((left, right) => left.time - right.time);
  const first = ordered[0];
  if (!first) return;
  gain.setValueAtTime(first.gain, first.time);
  for (const point of ordered.slice(1)) {
    gain.linearRampToValueAtTime(point.gain, point.time);
  }
}

function audioOutputLatencySeconds(context: AudioContext): number {
  const latencyContext = context as AudioContext & {
    baseLatency?: number;
    outputLatency?: number;
  };
  const latency = latencyContext.outputLatency ?? latencyContext.baseLatency ?? 0;
  return Number.isFinite(latency) && latency > 0 ? latency : 0;
}

function validateInstrument(instrument: InstrumentId): void {
  if (!["synth", "piano", "guitar"].includes(instrument)) {
    throw new RangeError(`Unsupported playback instrument: ${instrument}`);
  }
}

function createAudioContext(): AudioContext {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor = globalThis.AudioContext ?? scope.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio API is not available in this environment.");
  }
  return new AudioContextConstructor();
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // The node may already be disconnected by the browser.
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
