import type { PlaybackEvent } from "./events";

export type PlaybackState = "idle" | "playing" | "paused";

export interface WebAudioPlayerOptions {
  masterGain?: number;
  oscillatorType?: OscillatorType;
  scheduleAheadSeconds?: number;
  onEventStart?: (event: PlaybackEvent | null) => void;
  onStateChange?: (state: PlaybackState) => void;
}

interface ScheduledNode {
  oscillator: OscillatorNode;
  gain: GainNode;
}

export class WebAudioPlayer {
  private readonly context: AudioContext;
  private readonly ownsContext: boolean;
  private readonly options: Required<Pick<
    WebAudioPlayerOptions,
    "masterGain" | "oscillatorType" | "scheduleAheadSeconds"
  >> & Pick<WebAudioPlayerOptions, "onEventStart" | "onStateChange">;
  private events: PlaybackEvent[] = [];
  private nodes: ScheduledNode[] = [];
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private state: PlaybackState = "idle";
  private positionSeconds = 0;
  private anchorContextTime = 0;
  private totalDuration = 0;

  constructor(context?: AudioContext, options: WebAudioPlayerOptions = {}) {
    this.context = context ?? createAudioContext();
    this.ownsContext = context === undefined;
    this.options = {
      masterGain: options.masterGain ?? 0.2,
      oscillatorType: options.oscillatorType ?? "sine",
      scheduleAheadSeconds: options.scheduleAheadSeconds ?? 0.03,
      ...(options.onEventStart ? { onEventStart: options.onEventStart } : {}),
      ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
    };

    if (this.options.masterGain < 0 || this.options.masterGain > 1) {
      throw new RangeError("masterGain must be between 0 and 1.");
    }
    if (this.options.scheduleAheadSeconds < 0) {
      throw new RangeError("scheduleAheadSeconds cannot be negative.");
    }
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get currentTime(): number {
    if (this.state !== "playing") return this.positionSeconds;
    return clamp(this.context.currentTime - this.anchorContextTime, 0, this.totalDuration);
  }

  play(events: PlaybackEvent[]): void {
    this.cancelScheduled();
    this.events = [...events].sort((left, right) => left.startTime - right.startTime);
    this.positionSeconds = 0;
    this.totalDuration = this.events.reduce(
      (latest, event) => Math.max(latest, event.startTime + event.duration),
      0,
    );

    if (this.events.length === 0) {
      this.setState("idle");
      this.options.onEventStart?.(null);
      return;
    }

    if (this.context.state === "suspended") void this.context.resume();
    this.scheduleFrom(0);
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
    this.cancelScheduled();
    this.events = [];
    this.positionSeconds = 0;
    this.totalDuration = 0;
    this.setState("idle");
    this.options.onEventStart?.(null);
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.ownsContext && this.context.state !== "closed") {
      await this.context.close();
    }
  }

  private scheduleFrom(position: number): void {
    const startAt = this.context.currentTime + this.options.scheduleAheadSeconds;
    this.anchorContextTime = startAt - position;
    this.positionSeconds = position;
    this.setState("playing");

    for (const event of this.events) {
      const eventEnd = event.startTime + event.duration;
      if (eventEnd <= position) continue;

      const audibleStart = Math.max(event.startTime, position);
      const contextStart = this.anchorContextTime + audibleStart;
      const contextEnd = this.anchorContextTime + eventEnd;
      this.scheduleNote(event, contextStart, contextEnd);

      const startDelay = Math.max(0, contextStart - this.context.currentTime) * 1000;
      const endDelay = Math.max(0, contextEnd - this.context.currentTime) * 1000;
      this.timers.push(setTimeout(() => this.options.onEventStart?.(event), startDelay));
      this.timers.push(setTimeout(() => this.options.onEventStart?.(null), endDelay));
    }

    const completionDelay = Math.max(
      0,
      this.anchorContextTime + this.totalDuration - this.context.currentTime,
    ) * 1000;
    this.timers.push(setTimeout(() => {
      this.nodes = [];
      this.timers = [];
      this.positionSeconds = this.totalDuration;
      this.setState("idle");
      this.options.onEventStart?.(null);
    }, completionDelay));
  }

  private scheduleNote(event: PlaybackEvent, start: number, end: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const amplitude = (event.velocity / 127) * this.options.masterGain;
    const releaseStart = Math.max(start, end - 0.01);

    oscillator.type = this.options.oscillatorType;
    oscillator.frequency.setValueAtTime(midiToFrequency(event.midi), start);
    gain.gain.setValueAtTime(amplitude, start);
    gain.gain.setValueAtTime(amplitude, releaseStart);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(end);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    this.nodes.push({ oscillator, gain });
  }

  private cancelScheduled(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    for (const { oscillator, gain } of this.nodes) {
      try {
        oscillator.stop();
      } catch {
        // The oscillator may already have ended.
      }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.nodes = [];
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
