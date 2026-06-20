import "./styles.css";
import type { Score } from "../core/ast";
import { parseJabc } from "../core/parser";
import { toStandardAbc } from "../converters/to-abc";
import { toMusicXml } from "../converters/to-musicxml";
import type { PlaybackEvent } from "../playback/events";
import { scoreToPlaybackEvents } from "../playback/events";
import type { InstrumentId, PlaybackState } from "../playback/web-audio-player";
import { WebAudioPlayer } from "../playback/web-audio-player";
import { renderJianpu } from "../renderers/jianpu-renderer";
import {
  loadStaffRendererEngine,
  renderStaff,
} from "../renderers/staff-renderer";

const EXAMPLE = `X:1
T:两只老虎
M:4/4
L:1/4
Q:1/4=120
K:C jianpu
| 1 2 3 1 | 1 2 3 1 |
| 3 4 5 - | 3 4 5 - |
| 5 6 5 4 | 3 1 - - |
w: 两 只 老 虎 两 只 老 虎 跑 得 快 跑 得 快`;

type NotationMode = "jianpu" | "staff";

const editor = element<HTMLTextAreaElement>("jabc-editor");
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
const playButton = element<HTMLButtonElement>("play-button");
const pauseButton = element<HTMLButtonElement>("pause-button");
const resumeButton = element<HTMLButtonElement>("resume-button");
const stopButton = element<HTMLButtonElement>("stop-button");
const copyAbcButton = element<HTMLButtonElement>("copy-abc-button");
const downloadAbcButton = element<HTMLButtonElement>("download-abc-button");
const copyMusicXmlButton = element<HTMLButtonElement>("copy-musicxml-button");
const downloadMusicXmlButton = element<HTMLButtonElement>("download-musicxml-button");

let events: PlaybackEvent[] = [];
let currentScore: Score | undefined;
let currentAbc = "";
let currentMusicXml = "";
let activeEventId: string | undefined;
let staffRenderVersion = 0;
let player: WebAudioPlayer | undefined;
let playerState: PlaybackState = "idle";

editor.value = EXAMPLE;
editor.addEventListener("input", () => {
  player?.stop();
  evaluateSource();
});

playButton.addEventListener("click", () => {
  if (events.length === 0) return;
  try {
    getPlayer().play(events);
  } catch (error) {
    showRuntimeError(error);
  }
});
pauseButton.addEventListener("click", () => player?.pause());
resumeButton.addEventListener("click", () => player?.resume());
stopButton.addEventListener("click", () => player?.stop());
instrumentSelect.addEventListener("change", () => player?.setInstrument(selectedInstrument()));
notationSelect.addEventListener("change", () => renderActivePreview(activeEventId));
alignMeasuresToggle.addEventListener("change", () => renderActivePreview(activeEventId));
copyAbcButton.addEventListener("click", () => void copyText(currentAbc, "ABC 已复制"));
downloadAbcButton.addEventListener("click", () => downloadText(currentAbc, fileBaseName("abc"), "text/vnd.abc"));
copyMusicXmlButton.addEventListener("click", () => void copyText(currentMusicXml, "MusicXML 已复制"));
downloadMusicXmlButton.addEventListener("click", () => downloadText(currentMusicXml, fileBaseName("musicxml"), "application/vnd.recordare.musicxml+xml"));
window.addEventListener("resize", () => renderActivePreview(activeEventId));

evaluateSource();
updateControls();

function evaluateSource(): void {
  const result = parseJabc(editor.value);
  if (!result.success) {
    events = [];
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
    events = scoreToPlaybackEvents(result.value);
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
    currentAbc = "";
    currentMusicXml = "";
    showRuntimeError(error);
  }
  updateControls();
}

function getPlayer(): WebAudioPlayer {
  player ??= new WebAudioPlayer(undefined, {
    masterGain: 0.2,
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
  return player;
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
  playButton.disabled = events.length === 0 || playerState === "loading";
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
