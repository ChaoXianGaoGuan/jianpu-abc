import "./styles.css";
import type { Score } from "../core/ast";
import { parseJabc } from "../core/parser";
import { toStandardAbc } from "../converters/to-abc";
import { toMusicXml } from "../converters/to-musicxml";
import type { PlaybackEvent, PlaybackPlan } from "../playback/events";
import { prependCountIn, scoreToPlaybackPlan } from "../playback/events";
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
import {
  composeSvgFragments,
  rasterSize,
  scoreImageFilename,
  type ScoreImageFormat,
  type SvgFragment,
} from "./score-image-export";
import {
  buildLyricSourceRanges,
  buildSourceEventRanges,
  sourceEventAtCaret,
  sourceEventById,
  sourceEventForMeasureCaret,
  sourceLyricAtCaret,
  sourceLyricByEventId,
  type LyricSourceRange,
  type SourceEventRange,
} from "./source-navigation";
import { rhythmWarningMessages } from "./rhythm-warnings";

type NotationMode = "jianpu" | "staff";
type AppView = "workbench" | "library" | "guide";

const workbenchViewButton = element<HTMLButtonElement>("workbench-view-button");
const libraryViewButton = element<HTMLButtonElement>("library-view-button");
const guideViewButton = element<HTMLButtonElement>("guide-view-button");
const workbenchView = element<HTMLElement>("workbench-view");
const libraryView = element<HTMLElement>("library-view");
const guideView = element<HTMLElement>("guide-view");
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
const measureColumnsSelect = element<HTMLSelectElement>("measure-columns-select");
const beatClearToggle = element<HTMLInputElement>("beat-clear-toggle");
const downloadScoreSvgButton = element<HTMLButtonElement>("download-score-svg-button");
const downloadScorePngButton = element<HTMLButtonElement>("download-score-png-button");
const parseStatus = element<HTMLDivElement>("parse-status");
const parseErrors = element<HTMLPreElement>("parse-errors");
const currentMeasureLabel = element<HTMLSpanElement>("current-measure-label");
const currentMeasurePreview = element<HTMLDivElement>("current-measure-preview");
const eventCount = element<HTMLSpanElement>("event-count");
const playbackState = element<HTMLElement>("playback-state");
const currentEvent = element<HTMLElement>("current-event");
const instrumentSelect = element<HTMLSelectElement>("instrument-select");
const metronomeToggle = element<HTMLInputElement>("metronome-toggle");
const countInToggle = element<HTMLInputElement>("count-in-toggle");
const meterNumerator = element<HTMLInputElement>("meter-numerator");
const meterDenominator = element<HTMLInputElement>("meter-denominator");
const tempoBpm = element<HTMLInputElement>("tempo-bpm");
const tempoLabel = element<HTMLSpanElement>("tempo-label");
const instrumentVolume = element<HTMLInputElement>("instrument-volume");
const instrumentVolumeValue = element<HTMLOutputElement>("instrument-volume-value");
const metronomeVolume = element<HTMLInputElement>("metronome-volume");
const metronomeVolumeValue = element<HTMLOutputElement>("metronome-volume-value");
const playButton = element<HTMLButtonElement>("play-button");
const playFromSelectionButton = element<HTMLButtonElement>("play-from-selection-button");
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
let playbackEventId: string | undefined;
let playbackStartEventId: string | undefined;
let sourceEventId: string | undefined;
let sourceEventIds: string[] = [];
let sourceEventRanges: SourceEventRange[] = [];
let sourceLyricRanges: LyricSourceRange[] = [];
let staffRenderVersion = 0;
let previewReady = false;
let previewExportPending = false;
let player: WebAudioPlayer | undefined;
let playerState: PlaybackState = "idle";
let loadedLibraryId: string | undefined;
let loadedLibrarySource: string | undefined;
let manualMeter = { numerator: 4, denominator: 4 };
let manualBpm = 120;
let currentView: AppView = "workbench";

const guideExamples: Record<string, string> = {
  basic: `T:小星星
M:4/4
L:1/4
Q:1/4=100
K:C jianpu
| 1 1 5 5 | 6 6 5 - |
w: 一 闪 一 闪
| 4 4 3 3 | 2 2 1 - |
w: 亮 晶 晶`,
  template: `T:标题
C:作者或来源
M:4/4
L:1/4
Q:1/4=120
K:C jianpu

| 1 2 3 4 | 5 6 7 1' |
w: 这 里 写 歌 词`,
  lyrics: `T:歌词对齐示例
M:4/4
L:1/4
Q:1/4=100
K:C jianpu
% 前奏，没有 w: 就不显示歌词
| 1 2 3 5 | 6 5 3 2 |

| 1 1 5 5 | 6 6 5 - |
w: 一 闪 一 闪
| 4 4 3 3 | 2 2 1 - |
w: * 晶 晶 亮`,
  durations: `T:时值示例
M:4/4
L:1/4
Q:1/4=96
K:C jianpu
| 1 2/2 3e 4s | 5. 6*2 7.. - |`,
  ties: `T:拖腔与连线示例
M:4/4
L:1/4
Q:1/4=88
K:C jianpu
| 1 - 2~ | ~2 (4 5) 6. |
w: 长 连 啊 点`,
  repeats: `T:反复示例
M:4/4
L:1/4
K:C jianpu
|: 1 2 | 3 4 :| [1 5 5 || [2 1' - |]`,
  advanced: `T:多声部示例
M:4/4
L:1/4
Q:1/4=100
K:C jianpu
V:melody
| (3 1 2 3 | 1~ | ~1 - |
V:bass
| 1, 5, | 1, - |`,
};

workbenchViewButton.addEventListener("click", () => showAppView("workbench"));
libraryViewButton.addEventListener("click", () => showAppView("library"));
guideViewButton.addEventListener("click", () => showAppView("guide"));
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-guide-example]")) {
  button.addEventListener("click", () => loadGuideExample(button.dataset.guideExample));
}

editor.addEventListener("input", () => {
  player?.stop();
  playbackStartEventId = undefined;
  evaluateSource();
  renderLibraryList();
});
for (const eventName of ["click", "keyup", "select"] as const) {
  editor.addEventListener(eventName, updateSourceCaretHighlight);
}
editor.addEventListener("focus", updateSourceCaretHighlight);
editor.addEventListener("blur", clearSourceCaretHighlight);
librarySearch.addEventListener("input", renderLibraryList);
libraryCategory.addEventListener("change", renderLibraryList);

playButton.addEventListener("click", () => {
  playFromTime(0, metronomeToggle.checked && countInToggle.checked);
});
playFromSelectionButton.addEventListener("click", () => {
  const startTime = selectedPlaybackStartTime();
  if (startTime === undefined) return;
  playFromTime(startTime);
});
pauseButton.addEventListener("click", () => player?.pause());
resumeButton.addEventListener("click", () => player?.resume());
stopButton.addEventListener("click", () => player?.stop());
instrumentSelect.addEventListener("change", () => player?.setInstrument(selectedInstrument()));
metronomeToggle.addEventListener("input", () => {
  player?.setMetronomeEnabled(metronomeToggle.checked);
  updateControls();
});
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
notationSelect.addEventListener("change", renderActivePreview);
alignMeasuresToggle.addEventListener("change", renderActivePreview);
measureColumnsSelect.addEventListener("change", renderActivePreview);
beatClearToggle.addEventListener("change", () => {
  updateCurrentMeasurePreview();
  renderActivePreview();
});
downloadScoreSvgButton.addEventListener("click", () => void downloadScoreImage("svg"));
downloadScorePngButton.addEventListener("click", () => void downloadScoreImage("png"));
jianpuPreview.addEventListener("click", selectPlaybackStartFromJianpu);
jianpuPreview.addEventListener("contextmenu", navigateFromJianpu);
copyAbcButton.addEventListener("click", () => void copyText(currentAbc, "ABC 已复制"));
downloadAbcButton.addEventListener("click", () => downloadText(currentAbc, fileBaseName("abc"), "text/vnd.abc"));
copyMusicXmlButton.addEventListener("click", () => void copyText(currentMusicXml, "MusicXML 已复制"));
downloadMusicXmlButton.addEventListener("click", () => downloadText(currentMusicXml, fileBaseName("musicxml"), "application/vnd.recordare.musicxml+xml"));
window.addEventListener("resize", () => {
  updateCurrentMeasurePreview();
  renderActivePreview();
});

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
    const action = document.createElement("span");
    action.className = "score-library-action";
    action.textContent = entry.id === loadedLibraryId ? "当前曲谱" : "载入工作台";
    button.append(title, metadata, action);
    button.addEventListener("click", () => {
      if (loadLibraryEntry(entry, true)) showAppView("workbench");
    });
    libraryList.append(button);
  }
  libraryCount.textContent = visibleEntries.length === bundledScoreLibrary.entries.length
    ? `${visibleEntries.length} 首`
    : `${visibleEntries.length} / ${bundledScoreLibrary.entries.length} 首`;
  libraryEmpty.classList.toggle("hidden", visibleEntries.length > 0);
}

function loadLibraryEntry(entry: ScoreLibraryEntry, protectEdits: boolean): boolean {
  if (
    protectEdits
    && isLibraryEditorDirty(editor.value, loadedLibrarySource)
    && !window.confirm("当前编辑内容尚未保存。确定载入另一首曲谱并覆盖当前修改吗？")
  ) return false;

  player?.stop();
  playbackStartEventId = undefined;
  loadedLibraryId = entry.id;
  loadedLibrarySource = entry.source;
  editor.value = entry.source;
  evaluateSource();
  renderLibraryList();
  return true;
}

function showAppView(view: AppView): void {
  if (currentView === view) return;
  currentView = view;
  const showWorkbench = view === "workbench";
  const showLibrary = view === "library";
  const showGuide = view === "guide";
  workbenchView.classList.toggle("hidden", !showWorkbench);
  libraryView.classList.toggle("hidden", !showLibrary);
  guideView.classList.toggle("hidden", !showGuide);
  workbenchViewButton.classList.toggle("is-active", showWorkbench);
  libraryViewButton.classList.toggle("is-active", showLibrary);
  guideViewButton.classList.toggle("is-active", showGuide);
  workbenchViewButton.setAttribute("aria-pressed", String(showWorkbench));
  libraryViewButton.setAttribute("aria-pressed", String(showLibrary));
  guideViewButton.setAttribute("aria-pressed", String(showGuide));
  if (showWorkbench) renderActivePreview();
}

function loadGuideExample(exampleId: string | undefined): void {
  const source = exampleId ? guideExamples[exampleId] : undefined;
  if (source === undefined) return;
  if (
    isLibraryEditorDirty(editor.value, loadedLibrarySource)
    && !window.confirm("当前编辑内容尚未保存。确定载入示例并覆盖当前修改吗？")
  ) return;

  player?.stop();
  playbackStartEventId = undefined;
  loadedLibraryId = undefined;
  loadedLibrarySource = source;
  editor.value = source;
  evaluateSource();
  renderLibraryList();
  showAppView("workbench");
}

function evaluateSource(): void {
  const result = parseJabc(editor.value);
  if (!result.success) {
    events = [];
    playbackPlan = undefined;
    currentScore = undefined;
    playbackEventId = undefined;
    playbackStartEventId = undefined;
    sourceEventId = undefined;
    sourceEventIds = [];
    sourceEventRanges = [];
    sourceLyricRanges = [];
    previewReady = false;
    staffRenderVersion += 1;
    currentAbc = "";
    currentMusicXml = "";
    jianpuPreview.replaceChildren();
    staffPreview.replaceChildren();
    showEmptyMeasurePreview("解析成功后可查看当前小节预览。");
    parseStatus.textContent = `解析失败：${result.errors.length} 个错误`;
    parseStatus.className = "status error-status";
    parseErrors.className = "errors";
    parseErrors.textContent = result.errors.map((error) =>
      `第 ${error.line} 行，第 ${error.column} 列：${error.message}\n${error.suggestion ?? ""}`
    ).join("\n\n");
    eventCount.textContent = "0 个音符";
    updateControls();
    return;
  }

  try {
    currentScore = result.value;
    playbackEventId = undefined;
    sourceEventRanges = buildSourceEventRanges(result.value, editor.value);
    sourceLyricRanges = buildLyricSourceRanges(result.value, editor.value);
    setSourceCaretHighlightFromCaret(editor.selectionStart);
    syncTimingControls(result.value);
    playbackPlan = createPlaybackPlan(result.value);
    events = playbackPlan.events;
    currentAbc = toStandardAbc(result.value);
    currentMusicXml = toMusicXml(result.value);
    updateCurrentMeasurePreview();
    renderActivePreview();
    const measureCount = result.value.voices[0]?.measures.length ?? 0;
    const rhythmWarnings = rhythmWarningMessages(result.value, manualMeter);
    parseStatus.textContent = rhythmWarnings.length === 0
      ? `解析成功：${measureCount} 个小节`
      : `解析成功：${measureCount} 个小节，${rhythmWarnings.length} 个节奏提示`;
    parseStatus.className = rhythmWarnings.length === 0
      ? "status success-status"
      : "status warning-status";
    parseErrors.className = rhythmWarnings.length === 0 ? "errors" : "errors warnings";
    parseErrors.textContent = rhythmWarnings.join("\n");
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
      playbackEventId = event?.sourceEventId;
      currentEvent.textContent = playbackEventId ?? "—";
      highlightJianpuEvents();
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

function playFromTime(startTime: number, useCountIn = false): void {
  if (!playbackPlan || (events.length === 0 && playbackPlan.metronomeEvents.length === 0)) return;
  try {
    const activePlan = useCountIn ? prependCountIn(playbackPlan) : playbackPlan;
    getPlayer().play(activePlan.events, {
      metronomeEvents: activePlan.metronomeEvents,
      totalDuration: activePlan.duration,
      startTime: useCountIn ? 0 : startTime,
    });
  } catch (error) {
    showRuntimeError(error);
  }
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

function renderActivePreview(): void {
  if (!currentScore) return;
  const mode = selectedNotation();
  const showJianpu = mode === "jianpu";
  jianpuPreview.classList.toggle("hidden", !showJianpu);
  staffPreview.classList.toggle("hidden", showJianpu);
  alignMeasuresToggle.disabled = !showJianpu;
  measureColumnsSelect.disabled = !showJianpu;
  beatClearToggle.disabled = !showJianpu;
  previewKindIndicator.textContent = showJianpu ? "SVG" : "ABCJS";

  if (showJianpu) {
    renderJianpuPreview();
  } else {
    previewReady = false;
    updateControls();
    void renderStaffPreview(currentScore);
  }
}

function renderJianpuPreview(): void {
  if (!currentScore) return;
  const width = Math.max(320, Math.floor(jianpuPreview.clientWidth || 900));
  jianpuPreview.innerHTML = renderJianpu(currentScore, {
    width,
    showLyrics: true,
    alignMeasuresAcrossSystems: alignMeasuresToggle.checked,
    measuresPerSystem: selectedMeasuresPerSystem(),
    rhythmDisplay: beatClearToggle.checked ? "beat-clear" : "source",
  });
  previewReady = true;
  highlightJianpuEvents();
  updateControls();
}

function updateCurrentMeasurePreview(): void {
  if (!currentScore) {
    showEmptyMeasurePreview("解析成功后可查看当前小节预览。");
    return;
  }

  const range = sourceEventForMeasureCaret(
    sourceEventRanges,
    sourceLyricRanges,
    editor.selectionStart,
  );
  const target = parseSourceEventId(range?.eventId);
  if (!target) {
    showEmptyMeasurePreview("把插入符放到音符、休止符或转调标记上查看该小节。");
    return;
  }

  const voice = currentScore.voices.find((candidate) => candidate.id === target.voiceId);
  const measure = voice?.measures[target.measureIndex];
  if (!voice || !measure) {
    showEmptyMeasurePreview("无法定位当前小节。");
    return;
  }

  const header = { ...currentScore.header };
  delete header.title;
  delete header.composer;
  const previewScore: Score = {
    type: "Score",
    header,
    voices: [{
      id: voice.id,
      measures: [measure],
      lyricLines: voice.lyricLines,
    }],
  };
  const previewEventId = `${voice.id}:0:${target.eventIndex}`;
  const showMeasureLyrics = measure.events.some((event) =>
    event.type === "note" && event.lyric !== undefined
  );
  const width = Math.max(240, Math.floor(currentMeasurePreview.clientWidth || 520));
  currentMeasureLabel.textContent = `${voice.id} · 第 ${target.measureIndex + 1} 小节`;
  currentMeasurePreview.className = "current-measure-preview";
  currentMeasurePreview.classList.toggle("has-lyrics", showMeasureLyrics);
  try {
    currentMeasurePreview.innerHTML = renderJianpu(previewScore, {
      width,
      fontSize: 24,
      showHeader: false,
      showLyrics: showMeasureLyrics,
      highlightEventId: previewEventId,
      alignMeasuresAcrossSystems: false,
      rhythmDisplay: beatClearToggle.checked ? "beat-clear" : "source",
      styleScope: "current-measure-preview-score",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showEmptyMeasurePreview(message, "measure-preview-error");
  }
}

function sourceLineNumber(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

function parseSourceEventId(eventId: string | undefined): {
  voiceId: string;
  measureIndex: number;
  eventIndex: number;
} | undefined {
  if (!eventId) return undefined;
  const parts = eventId.split(":");
  const eventPart = parts.pop();
  const measurePart = parts.pop();
  const voiceId = parts.join(":");
  const measureIndex = Number(measurePart);
  const eventIndex = Number(eventPart);
  if (!voiceId || !Number.isInteger(measureIndex) || !Number.isInteger(eventIndex)) return undefined;
  return { voiceId, measureIndex, eventIndex };
}

function showEmptyMeasurePreview(message: string, className = "measure-preview-empty"): void {
  currentMeasureLabel.textContent = "未定位";
  currentMeasurePreview.className = className;
  currentMeasurePreview.textContent = message;
}

function highlightJianpuEvents(): void {
  const sourceActiveIds = new Set(sourceEventIds);
  for (const item of jianpuPreview.querySelectorAll<SVGGElement>(".jabc-event")) {
    const eventId = item.dataset.eventId;
    const isSourceActive = eventId !== undefined && sourceActiveIds.has(eventId);
    item.classList.toggle("is-highlighted", eventId === playbackEventId);
    item.classList.toggle("is-source-active", isSourceActive);
    item.classList.toggle("is-playback-start", !isSourceActive && eventId === playbackStartEventId);
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
    previewReady = staffPreview.querySelector("svg") !== null;
    updateControls();
  } catch (error) {
    if (version === staffRenderVersion) {
      previewReady = false;
      showRuntimeError(error);
      updateControls();
    }
  }
}

function updateSourceCaretHighlight(): void {
  if (!currentScore || playerState === "playing") return;
  setSourceCaretHighlightFromCaret(editor.selectionStart);
  updateCurrentMeasurePreview();
  highlightJianpuEvents();
  updateControls();
}

function setSourceCaretHighlightFromCaret(caret: number): void {
  const lyricRange = sourceLyricAtCaret(sourceLyricRanges, caret);
  if (lyricRange) {
    setSourceActiveEvents(lyricRange.eventIds);
    return;
  }

  const eventRange = sourceEventAtCaret(sourceEventRanges, caret);
  if (!eventRange) {
    setSourceActiveEvents([]);
    return;
  }

  const lyricForEvent = sourceLyricByEventId(sourceLyricRanges, eventRange.eventId);
  setSourceActiveEvents(lyricForEvent?.eventIds ?? [eventRange.eventId]);
}

function setSourceActiveEvents(eventIds: string[]): void {
  sourceEventIds = eventIds;
  sourceEventId = eventIds[0];
}

function clearSourceCaretHighlight(): void {
  sourceEventId = undefined;
  sourceEventIds = [];
  highlightJianpuEvents();
  updateControls();
}

function selectPlaybackStartFromJianpu(event: MouseEvent): void {
  const target = event.target instanceof Element
    ? event.target.closest<SVGGElement>(".jabc-event")
    : null;
  const eventId = target?.dataset.eventId;
  if (!eventId) return;
  playbackStartEventId = playbackStartEventId === eventId ? undefined : eventId;
  highlightJianpuEvents();
  updateControls();
}

function navigateFromJianpu(event: MouseEvent): void {
  const lyricTarget = event.target instanceof Element
    ? event.target.closest<SVGTextElement>(".event-lyric")
    : null;
  const target = event.target instanceof Element
    ? event.target.closest<SVGGElement>(".jabc-event")
    : null;
  const eventId = lyricTarget?.dataset.lyricEventId ?? target?.dataset.eventId;
  if (!eventId) return;
  const lyricRange = lyricTarget ? sourceLyricByEventId(sourceLyricRanges, eventId) : undefined;
  const eventRange = lyricRange === undefined ? sourceEventById(sourceEventRanges, eventId) : undefined;
  const range = lyricRange ?? eventRange;
  if (!range) return;

  event.preventDefault();
  player?.stop();
  playbackEventId = undefined;
  setSourceActiveEvents(lyricRange?.eventIds ?? [eventId]);
  editor.focus();
  editor.setSelectionRange(range.start, range.end);
  const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 25;
  const line = "line" in range ? range.line : sourceLineNumber(editor.value, range.start);
  editor.scrollTop = Math.max(0, (line - 2) * lineHeight);
  highlightJianpuEvents();
}

function updateControls(): void {
  playButton.disabled = (
    !playbackPlan
    || (events.length === 0 && playbackPlan.metronomeEvents.length === 0)
    || playerState === "loading"
  );
  playFromSelectionButton.disabled = (
    !playbackPlan
    || selectedPlaybackStartTime() === undefined
    || playerState === "loading"
  );
  pauseButton.disabled = playerState !== "playing";
  resumeButton.disabled = playerState !== "paused";
  stopButton.disabled = playerState === "idle";
  countInToggle.disabled = !metronomeToggle.checked;
  copyAbcButton.disabled = currentAbc === "";
  downloadAbcButton.disabled = currentAbc === "";
  copyMusicXmlButton.disabled = currentMusicXml === "";
  downloadMusicXmlButton.disabled = currentMusicXml === "";
  const imageDownloadDisabled = !previewReady || previewExportPending;
  downloadScoreSvgButton.disabled = imageDownloadDisabled;
  downloadScorePngButton.disabled = imageDownloadDisabled;
}

function selectedPlaybackStartTime(): number | undefined {
  return playbackStartTimeFromSourceEvent(playbackStartEventId);
}

function playbackStartTimeFromSourceEvent(eventId: string | undefined): number | undefined {
  if (!eventId) return undefined;
  const directEvent = events.find((event) => event.sourceEventId === eventId);
  if (directEvent) return directEvent.startTime;

  const rangeIndex = sourceEventRanges.findIndex((range) => range.eventId === eventId);
  if (rangeIndex < 0) return undefined;
  for (const range of sourceEventRanges.slice(rangeIndex + 1)) {
    const nextEvent = events.find((event) => event.sourceEventId === range.eventId);
    if (nextEvent) return nextEvent.startTime;
  }
  return undefined;
}

function showRuntimeError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  parseStatus.textContent = "无法生成或播放当前乐谱";
  parseStatus.className = "status error-status";
  parseErrors.className = "errors";
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

async function downloadScoreImage(format: ScoreImageFormat): Promise<void> {
  if (!currentScore || !previewReady || previewExportPending) return;
  previewExportPending = true;
  updateControls();
  try {
    await document.fonts.ready;
    const notation = selectedNotation();
    const scoreSvg = collectPreviewSvg(notation === "jianpu" ? jianpuPreview : staffPreview);
    const filename = scoreImageFilename(currentScore.header.title, notation, format);
    if (format === "svg") {
      downloadBlob(new Blob([scoreSvg.markup], { type: "image/svg+xml;charset=utf-8" }), filename);
    } else {
      downloadBlob(await svgToPng(scoreSvg), filename);
    }
  } catch (error) {
    showRuntimeError(error);
  } finally {
    previewExportPending = false;
    updateControls();
  }
}

function collectPreviewSvg(container: HTMLElement): SvgFragment {
  const fragments = [...container.querySelectorAll<SVGSVGElement>("svg")]
    .filter((svg) => svg.parentElement?.closest("svg") === null)
    .map(svgFragment);
  return composeSvgFragments(fragments);
}

function svgFragment(svg: SVGSVGElement): SvgFragment {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  for (const item of clone.querySelectorAll(".is-highlighted, .is-playback-start, .is-source-active")) {
    item.classList.remove("is-highlighted", "is-playback-start", "is-source-active");
  }
  const viewBox = svg.viewBox.baseVal;
  const bounds = svg.getBoundingClientRect();
  const width = viewBox.width || bounds.width;
  const height = viewBox.height || bounds.height;
  if (width <= 0 || height <= 0) throw new Error("渲染结果没有有效的 SVG 尺寸。");
  return { markup: new XMLSerializer().serializeToString(clone), width, height };
}

async function svgToPng(svg: SvgFragment): Promise<Blob> {
  const imageUrl = URL.createObjectURL(new Blob([svg.markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = imageUrl;
    await image.decode();
    const size = rasterSize(svg.width, svg.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建 PNG 画布。");
    context.fillStyle = "#fffef9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器无法生成 PNG 文件。"));
    }, "image/png"));
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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

function selectedMeasuresPerSystem(): number | undefined {
  if (measureColumnsSelect.value === "auto") return undefined;
  const value = Number(measureColumnsSelect.value);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing required element #${id}.`);
  return target as T;
}
