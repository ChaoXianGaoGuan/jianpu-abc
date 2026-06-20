import "./styles.css";
import type { Score } from "../core/ast";
import { parseJabc } from "../core/parser";
import { toStandardAbc } from "../converters/to-abc";
import { toMusicXml } from "../converters/to-musicxml";
import type { PlaybackEvent, PlaybackPlan } from "../playback/events";
import { scoreToPlaybackPlan } from "../playback/events";
import type { InstrumentId, PlaybackState } from "../playback/web-audio-player";
import { WebAudioPlayer } from "../playback/web-audio-player";
import { renderJianpu } from "../renderers/jianpu-renderer";
import {
  loadStaffRendererEngine,
  renderStaff,
} from "../renderers/staff-renderer";
import type { ScoreLibraryEntry } from "./score-library";
import {
  bundledScoreLibrary,
  filterScoreLibrary,
  isLibraryEditorDirty,
  scoreLibraryCategories,
} from "./score-library";

type NotationMode = "jianpu" | "staff";

const editor = element<HTMLTextAreaElement>("jabc-editor");
const librarySearch = element<HTMLInputElement>("library-search");
const libraryCategory = element<HTMLSelectElement>("library-category");
const libraryCount = element<HTMLSpanElement>("library-count");
const libraryErrors = element<HTMLDivElement>("library-errors");
const libraryList = element<HTMLDivElement>("library-list");
const libraryEmpty = element<HTMLParagraphElement>("library-empty");
const jianpuPreview = element<HTMLDivElement>("jianpu-preview");
const staffPreview = element<HTMLDivElement>("staff-preview");
const notationSelect = element<HTMLSelectElement>("notation-select");
const previewKindIndicator = element<HTMLSpanElement>("preview-kind-indicator");
const alignMeasuresToggle = element<HTMLInputElement>("align-measures-toggle");
const parseStatus = element<HTMLDivElement>("parse-status");
const parseErrors = element<HTMLPreElement>("parse-errors");
const eventCount = element<HTMLSpanElement>("event-count");
const playbackState = element<HTMLElement>("playback-state");
const currentEvent = element<HTMLElement>("current-event");
const instrumentSelect = element<HTMLSelectElement>("instrument-select");
const metronomeToggle = element<HTMLInputElement>("metronome-toggle");
const meterNumerator = element<HTMLInputElement>("meter-numerator");
const meterDenominator = element<HTMLInputElement>("meter-denominator");
const tempoBpm = element<HTMLInputElement>("tempo-bpm");
const tempoLabel = element<HTMLSpanElement>("tempo-label");
const instrumentVolume = element<HTMLInputElement>("instrument-volume");
const instrumentVolumeValue = element<HTMLOutputElement>("instrument-volume-value");
const metronomeVolume = element<HTMLInputElement>("metronome-volume");
const metronomeVolumeValue = element<HTMLOutputElement>("metronome-volume-value");
const playButton = element<HTMLButtonElement>("play-button");
const pauseButton = element<HTMLButtonElement>("pause-button");
const resumeButton = element<HTMLButtonElement>("resume-button");
const stopButton = element<HTMLButtonElement>("stop-button");
const copyAbcButton = element<HTMLButtonElement>("copy-abc-button");
const downloadAbcButton = element<HTMLButtonElement>("download-abc-button");
const copyMusicXmlButton = element<HTMLButtonElement>("copy-musicxml-button");
const downloadMusicXmlButton = element<HTMLButtonElement>("download-musicxml-button");

let events: PlaybackEvent[] = [];
let playbackPlan: PlaybackPlan | undefined;
let currentScore: Score | undefined;
let currentAbc = "";
let currentMusicXml = "";
let activeEventId: string | undefined;
let staffRenderVersion = 0;
let player: WebAudioPlayer | undefined;
let playerState: PlaybackState = "idle";
let loadedLibraryId: string | undefined;
let loadedLibrarySource: string | undefined;
let manualMeter = { numerator: 4, denominator: 4 };
let manualBpm = 120;

editor.addEventListener("input", () => {
  player?.stop();
  evaluateSource();
  renderLibraryList();
});
librarySearch.addEventListener("input", renderLibraryList);
libraryCategory.addEventListener("change", renderLibraryList);

playButton.addEventListener("click", () => {
  if (!playbackPlan || (events.length === 0 && playbackPlan.metronomeEvents.length === 0)) return;
  try {
    getPlayer().play(events, {
      metronomeEvents: playbackPlan.metronomeEvents,
      totalDuration: playbackPlan.duration,
    });
  } catch (error) {
    showRuntimeError(error);
  }
});
pauseButton.addEventListener("click", () => player?.pause());
resumeButton.addEventListener("click", () => player?.resume());
stopButton.addEventListener("click", () => player?.stop());
instrumentSelect.addEventListener("change", () => player?.setInstrument(selectedInstrument()));
metronomeToggle.addEventListener("input", () =>
  player?.setMetronomeEnabled(metronomeToggle.checked));
instrumentVolume.addEventListener("input", () => {
  instrumentVolumeValue.value = `${instrumentVolume.value}%`;
  player?.setInstrumentVolume(sliderGain(instrumentVolume));
});
metronomeVolume.addEventListener("input", () => {
  metronomeVolumeValue.value = `${metronomeVolume.value}%`;
  player?.setMetronomeVolume(sliderGain(metronomeVolume));
});
meterNumerator.addEventListener("input", updateManualTiming);
meterDenominator.addEventListener("input", updateManualTiming);
tempoBpm.addEventListener("input", updateManualTiming);
notationSelect.addEventListener("change", () => renderActivePreview(activeEventId));
alignMeasuresToggle.addEventListener("change", () => renderActivePreview(activeEventId));
copyAbcButton.addEventListener("click", () => void copyText(currentAbc, "ABC 已复制"));
downloadAbcButton.addEventListener("click", () => downloadText(currentAbc, fileBaseName("abc"), "text/vnd.abc"));
copyMusicXmlButton.addEventListener("click", () => void copyText(currentMusicXml, "MusicXML 已复制"));
downloadMusicXmlButton.addEventListener("click", () => downloadText(currentMusicXml, fileBaseName("musicxml"), "application/vnd.recordare.musicxml+xml"));
window.addEventListener("resize", () => renderActivePreview(activeEventId));

initializeLibrary();
updateControls();

function initializeLibrary(): void {
  for (const category of scoreLibraryCategories(bundledScoreLibrary.entries)) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    libraryCategory.append(option);
  }
  libraryErrors.textContent = bundledScoreLibrary.errors
    .map((error) => `${error.id}\n${error.message}`)
    .join("\n\n");
  libraryErrors.classList.toggle("hidden", bundledScoreLibrary.errors.length === 0);

  const initial = bundledScoreLibrary.entries[0];
  if (initial) {
    loadLibraryEntry(initial, false);
  } else {
    editor.value = "";
    evaluateSource();
    renderLibraryList();
  }
}

function renderLibraryList(): void {
  const visibleEntries = filterScoreLibrary(bundledScoreLibrary.entries, {
    query: librarySearch.value,
    category: libraryCategory.value,
  });
  libraryList.replaceChildren();
  for (const entry of visibleEntries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "score-library-item";
    if (entry.id === loadedLibraryId) button.classList.add("is-current");
    button.setAttribute("aria-current", entry.id === loadedLibraryId ? "true" : "false");

    const title = document.createElement("strong");
    title.textContent = entry.title;
    const metadata = document.createElement("span");
    metadata.textContent = [entry.composer, entry.category].filter(Boolean).join(" · ");
    button.append(title, metadata);
    button.addEventListener("click", () => loadLibraryEntry(entry, true));
    libraryList.append(button);
  }
  libraryCount.textContent = visibleEntries.length === bundledScoreLibrary.entries.length
    ? `${visibleEntries.length} 首`
    : `${visibleEntries.length} / ${bundledScoreLibrary.entries.length} 首`;
  libraryEmpty.classList.toggle("hidden", visibleEntries.length > 0);
}

function loadLibraryEntry(entry: ScoreLibraryEntry, protectEdits: boolean): void {
  if (
    protectEdits
    && isLibraryEditorDirty(editor.value, loadedLibrarySource)
    && !window.confirm("当前编辑内容尚未保存。确定载入另一首曲谱并覆盖当前修改吗？")
  ) return;

  player?.stop();
  loadedLibraryId = entry.id;
  loadedLibrarySource = entry.source;
  editor.value = entry.source;
  evaluateSource();
  renderLibraryList();
}

function evaluateSource(): void {
  const result = parseJabc(editor.value);
  if (!result.success) {
    events = [];
    playbackPlan = undefined;
    currentScore = undefined;
    activeEventId = undefined;
    staffRenderVersion += 1;
    currentAbc = "";
    currentMusicXml = "";
    jianpuPreview.replaceChildren();
    staffPreview.replaceChildren();
    parseStatus.textContent = `解析失败：${result.errors.length} 个错误`;
    parseStatus.className = "status error-status";
    parseErrors.textContent = result.errors.map((error) =>
      `第 ${error.line} 行，第 ${error.column} 列：${error.message}\n${error.suggestion ?? ""}`
    ).join("\n\n");
    eventCount.textContent = "0 个音符";
    updateControls();
    return;
  }

  try {
    currentScore = result.value;
    activeEventId = undefined;
    syncTimingControls(result.value);
    playbackPlan = createPlaybackPlan(result.value);
    events = playbackPlan.events;
    currentAbc = toStandardAbc(result.value);
    currentMusicXml = toMusicXml(result.value);
    renderActivePreview();
    const measureCount = result.value.voices[0]?.measures.length ?? 0;
    parseStatus.textContent = `解析成功：${measureCount} 个小节`;
    parseStatus.className = "status success-status";
    parseErrors.textContent = "";
    eventCount.textContent = `${events.length} 个音符`;
  } catch (error) {
    events = [];
    playbackPlan = undefined;
    currentAbc = "";
    currentMusicXml = "";
    showRuntimeError(error);
  }
  updateControls();
}

function getPlayer(): WebAudioPlayer {
  player ??= new WebAudioPlayer(undefined, {
    masterGain: 0.2,
    metronomeGain: 0.3,
    metronomeEnabled: metronomeToggle.checked,
    oscillatorType: "triangle",
    instrument: selectedInstrument(),
    onEventStart: (event) => {
      activeEventId = event?.sourceEventId;
      currentEvent.textContent = activeEventId ?? "—";
      highlightJianpuEvent(activeEventId);
    },
    onStateChange: (state) => {
      playerState = state;
      playbackState.textContent = stateLabel(state);
      updateControls();
    },
  });
  player.setInstrumentVolume(sliderGain(instrumentVolume));
  player.setMetronomeVolume(sliderGain(metronomeVolume));
  return player;
}

function syncTimingControls(score: Score): void {
  const meter = score.header.meter ?? manualMeter;
  meterNumerator.value = String(meter.numerator);
  meterDenominator.value = String(meter.denominator);
  meterNumerator.disabled = score.header.meter !== undefined;
  meterDenominator.disabled = score.header.meter !== undefined;

  const tempo = score.header.tempo;
  tempoBpm.value = String(tempo?.bpm ?? manualBpm);
  tempoBpm.disabled = tempo !== undefined;
  const beat = tempo?.beat ?? playbackPulse(meter);
  tempoLabel.textContent = `速度（${beat.numerator}/${beat.denominator} BPM）`;
}

function createPlaybackPlan(score: Score): PlaybackPlan {
  const meter = score.header.meter ?? manualMeter;
  return scoreToPlaybackPlan(score, {
    defaultMeter: manualMeter,
    defaultTempo: { beat: playbackPulse(meter), bpm: manualBpm },
  });
}

function updateManualTiming(): void {
  if (!currentScore) return;
  if (!currentScore.header.meter) {
    const numerator = boundedInteger(Number(meterNumerator.value), 1, 32);
    const denominator = boundedInteger(Number(meterDenominator.value), 1, 64);
    if (numerator === undefined || denominator === undefined) return;
    manualMeter = {
      numerator,
      denominator,
    };
  }
  if (!currentScore.header.tempo) {
    const bpm = boundedInteger(Number(tempoBpm.value), 20, 300);
    if (bpm === undefined) return;
    manualBpm = bpm;
  }
  player?.stop();
  syncTimingControls(currentScore);
  playbackPlan = createPlaybackPlan(currentScore);
  events = playbackPlan.events;
  eventCount.textContent = `${events.length} 个音符`;
  updateControls();
}

function playbackPulse(meter: { numerator: number; denominator: number }) {
  return meter.denominator === 8 && [6, 9, 12].includes(meter.numerator)
    ? { numerator: 3, denominator: 8 }
    : { numerator: 1, denominator: meter.denominator };
}

function boundedInteger(value: number, min: number, max: number): number | undefined {
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function sliderGain(input: HTMLInputElement): number {
  return Number(input.value) / 100;
}

function renderActivePreview(highlightEventId?: string): void {
  if (!currentScore) return;
  const mode = selectedNotation();
  const showJianpu = mode === "jianpu";
  jianpuPreview.classList.toggle("hidden", !showJianpu);
  staffPreview.classList.toggle("hidden", showJianpu);
  alignMeasuresToggle.disabled = !showJianpu;
  previewKindIndicator.textContent = showJianpu ? "SVG" : "ABCJS";

  if (showJianpu) {
    renderJianpuPreview(highlightEventId);
  } else {
    void renderStaffPreview(currentScore);
  }
}

function renderJianpuPreview(highlightEventId?: string): void {
  if (!currentScore) return;
  const width = Math.max(320, Math.floor(jianpuPreview.clientWidth || 900));
  jianpuPreview.innerHTML = renderJianpu(currentScore, {
    width,
    showLyrics: true,
    alignMeasuresAcrossSystems: alignMeasuresToggle.checked,
  });
  highlightJianpuEvent(highlightEventId);
}

function highlightJianpuEvent(eventId?: string): void {
  for (const item of jianpuPreview.querySelectorAll<SVGGElement>(".jabc-event.is-highlighted")) {
    item.classList.remove("is-highlighted");
  }
  if (eventId === undefined) return;
  for (const item of jianpuPreview.querySelectorAll<SVGGElement>(".jabc-event")) {
    if (item.getAttribute("data-event-id") === eventId) {
      item.classList.add("is-highlighted");
      return;
    }
  }
}

async function renderStaffPreview(score: Score): Promise<void> {
  const version = ++staffRenderVersion;
  staffPreview.replaceChildren();
  try {
    const engine = await loadStaffRendererEngine();
    if (version !== staffRenderVersion || currentScore !== score || selectedNotation() !== "staff") return;
    const staffWidth = Math.max(480, Math.floor(staffPreview.clientWidth - 28));
    renderStaff(staffPreview, score, {
      responsive: true,
      scale: 1,
      staffWidth,
      measuresPerLine: 4,
    }, engine);
  } catch (error) {
    if (version === staffRenderVersion) showRuntimeError(error);
  }
}

function updateControls(): void {
  playButton.disabled = (
    !playbackPlan
    || (events.length === 0 && playbackPlan.metronomeEvents.length === 0)
    || playerState === "loading"
  );
  pauseButton.disabled = playerState !== "playing";
  resumeButton.disabled = playerState !== "paused";
  stopButton.disabled = playerState === "idle";
  copyAbcButton.disabled = currentAbc === "";
  downloadAbcButton.disabled = currentAbc === "";
  copyMusicXmlButton.disabled = currentMusicXml === "";
  downloadMusicXmlButton.disabled = currentMusicXml === "";
}

function showRuntimeError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  parseStatus.textContent = "无法生成或播放当前乐谱";
  parseStatus.className = "status error-status";
  parseErrors.textContent = message;
  eventCount.textContent = "0 个音符";
}

async function copyText(value: string, successMessage: string): Promise<void> {
  if (value === "") return;
  try {
    await navigator.clipboard.writeText(value);
    parseStatus.textContent = successMessage;
    parseStatus.className = "status success-status";
  } catch {
    showRuntimeError("浏览器拒绝访问剪贴板，请手动选择文本复制。");
  }
}

function downloadText(value: string, filename: string, type: string): void {
  if (value === "") return;
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileBaseName(extension: "abc" | "musicxml"): string {
  const rawTitle = currentScore?.header.title ?? "score";
  const safeTitle = rawTitle
    .trim()
    .replace(/[\\/:*?\"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    || "score";
  return `${safeTitle}.${extension}`;
}

function stateLabel(state: PlaybackState): string {
  if (state === "loading") return "加载音源中";
  if (state === "playing") return "播放中";
  if (state === "paused") return "已暂停";
  return "空闲";
}

function selectedInstrument(): InstrumentId {
  const value = instrumentSelect.value;
  if (value === "piano" || value === "synth") return value;
  return "guitar";
}

function selectedNotation(): NotationMode {
  return notationSelect.value === "staff" ? "staff" : "jianpu";
}

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing required element #${id}.`);
  return target as T;
}
