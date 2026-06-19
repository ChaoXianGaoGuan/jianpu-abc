import type {
  Accidental,
  Fraction,
  Measure,
  MusicalEvent,
  Score,
  Voice,
} from "../core/ast";
import { DEFAULT_NOTE_LENGTH, reduceFraction } from "../core/fraction";

export interface RenderOptions {
  width?: number;
  fontSize?: number;
  showLyrics?: boolean;
  highlightEventId?: string;
}

interface LayoutMeasure {
  measure: Measure;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  cellWidth: number;
}

const ACCIDENTAL_TEXT: Record<Accidental, string> = {
  sharp: "♯",
  flat: "♭",
  natural: "♮",
  "double-sharp": "♯♯",
  "double-flat": "♭♭",
};

export function renderJianpu(score: Score, options: RenderOptions = {}): string {
  const width = Math.max(320, options.width ?? 900);
  const fontSize = Math.max(18, options.fontSize ?? 32);
  const showLyrics = options.showLyrics ?? true;
  const padding = Math.max(24, fontSize);
  const defaultLength = score.header.defaultNoteLength ?? DEFAULT_NOTE_LENGTH;
  const titleY = padding;
  const metaY = score.header.title ? padding + 34 : padding;
  const musicTop = metaY + 58;
  const lineHeight = fontSize * (showLyrics ? 3.15 : 2.35);
  const title = score.header.title ?? "JABC score";
  const renderedVoices: string[] = [];
  let cursorY = musicTop;

  for (const [voiceIndex, voice] of score.voices.entries()) {
    if (score.voices.length > 1) {
      renderedVoices.push(`<text class="voice-label" x="${padding}" y="${round(cursorY - fontSize * 0.88)}">${escapeXml(voice.id)}</text>`);
    }
    const layout = layoutMeasures(voice, width, padding, cursorY, lineHeight, fontSize);
    renderedVoices.push(...layout.map((placed) => renderMeasure(
      voice,
      placed,
      defaultLength,
      fontSize,
      showLyrics,
      options.highlightEventId,
    )));
    const lastLineY = layout.at(-1)?.y ?? cursorY;
    cursorY = lastLineY + lineHeight + (voiceIndex === score.voices.length - 1 ? 0 : fontSize * 0.9);
  }

  const height = Math.ceil(cursorY + padding * 0.4);

  const content = [
    renderHeader(score, width, padding, titleY, metaY),
    ...renderedVoices,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="jianpu-score">
  <style>
    .score-title{font:600 25px Georgia,'Songti SC',serif;fill:#20332b;text-anchor:middle}
    .score-meta{font:600 14px Inter,'Microsoft YaHei',sans-serif;fill:#52655c}
    .score-composer{font:13px Inter,'Microsoft YaHei',sans-serif;fill:#718078;text-anchor:end}
    .voice-label{font:700 13px ui-monospace,Consolas,monospace;fill:#a4522c}
    .measure-barline{stroke:#33483f;stroke-width:1.6}
    .barline-text,.ending-text{font:700 15px ui-monospace,Consolas,monospace;fill:#33483f;text-anchor:middle}
    .event-bg{fill:transparent;transition:fill .12s ease}
    .event-symbol{font:600 ${fontSize}px 'Microsoft YaHei','Noto Sans SC',sans-serif;fill:#1f332a;text-anchor:middle}
    .event-accidental{font:600 ${fontSize * 0.52}px serif;fill:#1f332a;text-anchor:middle}
    .octave-dot,.duration-dot{fill:#1f332a}
    .duration-line{stroke:#1f332a;stroke-width:1.5;stroke-linecap:round}
    .duration-label{font:11px ui-monospace,Consolas,monospace;fill:#718078;text-anchor:middle}
    .tie-mark,.tuplet-mark,.slur-mark{font:700 ${fontSize * 0.56}px ui-monospace,Consolas,monospace;fill:#8d3f23;text-anchor:middle}
    .event-lyric{font:15px 'Microsoft YaHei','Noto Sans SC',sans-serif;fill:#4f6259;text-anchor:middle}
    .is-highlighted .event-bg{fill:#f7d98b}
    .is-highlighted .event-symbol,.is-highlighted .event-accidental{fill:#8d3f23}
  </style>
  ${content}
</svg>`;
}

function layoutMeasures(
  voice: Voice,
  width: number,
  padding: number,
  musicTop: number,
  lineHeight: number,
  fontSize: number,
): LayoutMeasure[] {
  const availableWidth = width - padding * 2;
  const baseCellWidth = fontSize * 1.55;
  const barSpace = fontSize * 0.55;
  const measureGap = fontSize * 0.35;
  const output: LayoutMeasure[] = [];
  let x = padding;
  let y = musicTop;

  for (const [measureIndex, measure] of voice.measures.entries()) {
    const eventCount = Math.max(1, measure.events.length);
    const naturalWidth = eventCount * baseCellWidth + barSpace;
    const measureWidth = Math.min(availableWidth, naturalWidth);
    const cellWidth = (measureWidth - barSpace) / eventCount;
    if (x > padding && x + measureWidth > width - padding) {
      x = padding;
      y += lineHeight;
    }
    output.push({ measure, measureIndex, x, y, width: measureWidth, cellWidth });
    x += measureWidth + measureGap;
  }
  return output;
}

function renderHeader(
  score: Score,
  width: number,
  padding: number,
  titleY: number,
  metaY: number,
): string {
  const lines: string[] = [];
  if (score.header.title) {
    lines.push(`<text class="score-title" x="${width / 2}" y="${titleY}">${escapeXml(score.header.title)}</text>`);
  }
  const meta = [
    score.header.key ? `1=${score.header.key.tonic}` : undefined,
    score.header.meter ? `${score.header.meter.numerator}/${score.header.meter.denominator}` : undefined,
    score.header.tempo
      ? `${formatFraction(score.header.tempo.beat)}=${score.header.tempo.bpm}`
      : undefined,
  ].filter((value): value is string => value !== undefined);
  if (meta.length > 0) {
    lines.push(`<text class="score-meta" x="${padding}" y="${metaY}">${escapeXml(meta.join("   "))}</text>`);
  }
  if (score.header.composer) {
    lines.push(`<text class="score-composer" x="${width - padding}" y="${metaY}">${escapeXml(score.header.composer)}</text>`);
  }
  return lines.join("");
}

function renderMeasure(
  voice: Voice,
  placed: LayoutMeasure,
  defaultLength: Fraction,
  fontSize: number,
  showLyrics: boolean,
  highlightEventId: string | undefined,
): string {
  const events = placed.measure.events.map((event, eventIndex) => {
    const eventId = `${voice.id}:${placed.measureIndex}:${eventIndex}`;
    const centerX = eventIndex * placed.cellWidth + placed.cellWidth / 2;
    return renderEvent(
      event,
      eventId,
      centerX,
      placed.cellWidth,
      defaultLength,
      fontSize,
      showLyrics,
      eventId === highlightEventId,
    );
  }).join("");
  const leftBarline = placed.measure.leftBarline
    ? `<text class="barline-text" x="${round(-fontSize * 0.18)}" y="${round(-fontSize * 0.18)}">${escapeXml(placed.measure.leftBarline.sourceText)}</text>`
    : "";
  const ending = placed.measure.ending
    ? `<text class="ending-text" x="${round(fontSize * 0.34)}" y="${round(-fontSize * 1.28)}">${escapeXml(placed.measure.ending.sourceText)}</text>`
    : "";
  const barline = placed.measure.barline
    ? placed.measure.barline.type === "single"
      ? `<line class="measure-barline" x1="${placed.width - fontSize * 0.22}" y1="${-fontSize}" x2="${placed.width - fontSize * 0.22}" y2="${fontSize * 0.52}"/>`
      : `<text class="barline-text" x="${round(placed.width - fontSize * 0.18)}" y="${round(-fontSize * 0.18)}">${escapeXml(placed.measure.barline.sourceText)}</text>`
    : "";
  return `<g class="measure" data-measure-index="${placed.measureIndex}" transform="translate(${round(placed.x)} ${round(placed.y)})">${leftBarline}${ending}${events}${barline}</g>`;
}

function renderEvent(
  event: MusicalEvent,
  eventId: string,
  centerX: number,
  cellWidth: number,
  defaultLength: Fraction,
  fontSize: number,
  showLyrics: boolean,
  highlighted: boolean,
): string {
  const symbol = event.type === "note" ? String(event.degree) : event.type === "rest" ? "0" : "−";
  const className = highlighted ? "jabc-event is-highlighted" : "jabc-event";
  const backgroundHeight = fontSize * (showLyrics ? 2.35 : 1.65);
  const dots = event.type === "extension" ? 0 : event.dots ?? 0;
  const parts = [
    `<rect class="event-bg" x="${round(centerX - cellWidth * 0.4)}" y="${round(-fontSize * 1.18)}" width="${round(cellWidth * 0.8)}" height="${round(backgroundHeight)}" rx="7"/>`,
    `<text class="event-symbol" x="${round(centerX)}" y="0">${symbol}</text>`,
  ];

  if (event.type === "note") {
    if (event.accidental) {
      parts.push(`<text class="event-accidental" x="${round(centerX - fontSize * 0.55)}" y="${round(-fontSize * 0.08)}">${ACCIDENTAL_TEXT[event.accidental]}</text>`);
    }
    parts.push(renderOctaveDots(centerX, event.octaveShift, fontSize));
    if (event.slurStart) {
      parts.push(`<text class="slur-mark" x="${round(centerX - fontSize * 0.52)}" y="${round(-fontSize * 1.18)}">(</text>`);
    }
    if (event.slurEnd) {
      parts.push(`<text class="slur-mark" x="${round(centerX + fontSize * 0.52)}" y="${round(-fontSize * 1.18)}">)</text>`);
    }
    if (event.tieEnd) {
      parts.push(`<text class="tie-mark" x="${round(centerX - fontSize * 0.52)}" y="${round(-fontSize * 0.62)}">~</text>`);
    }
    if (event.tieStart) {
      parts.push(`<text class="tie-mark" x="${round(centerX + fontSize * 0.52)}" y="${round(-fontSize * 0.62)}">~</text>`);
    }
  }
  if (event.type !== "extension") {
    if (event.tuplet?.position === "start") {
      parts.push(`<text class="tuplet-mark" x="${round(centerX - fontSize * 0.52)}" y="${round(-fontSize * 1.02)}">(${event.tuplet.actual}</text>`);
    }
    parts.push(renderDuration(event.duration, dots, defaultLength, centerX, fontSize));
  }
  if (dots > 0) {
    for (let index = 0; index < dots; index += 1) {
      parts.push(`<circle class="duration-dot" cx="${round(centerX + fontSize * (0.42 + index * 0.18))}" cy="${round(-fontSize * 0.08)}" r="2"/>`);
    }
  }
  if (showLyrics && event.type === "note" && event.lyric) {
    parts.push(`<text class="event-lyric" x="${round(centerX)}" y="${round(fontSize * 1.34)}">${escapeXml(event.lyric)}</text>`);
  }

  return `<g class="${className}" data-event-id="${escapeXml(eventId)}" aria-label="${escapeXml(event.sourceText ?? symbol)}">${parts.join("")}</g>`;
}

function renderOctaveDots(centerX: number, octaveShift: number, fontSize: number): string {
  if (octaveShift === 0) return "";
  const output: string[] = [];
  const direction = Math.sign(octaveShift);
  for (let index = 0; index < Math.abs(octaveShift); index += 1) {
    const y = direction > 0
      ? -fontSize * 1.02 - index * 6
      : fontSize * 0.35 + index * 6;
    output.push(`<circle class="octave-dot" cx="${round(centerX)}" cy="${round(y)}" r="2.3"/>`);
  }
  return output.join("");
}

function renderDuration(
  duration: Fraction,
  dots: number,
  defaultLength: Fraction,
  centerX: number,
  fontSize: number,
): string {
  const undotted = removeDots(duration, dots);
  const ratio = reduceFraction({
    numerator: undotted.numerator * defaultLength.denominator,
    denominator: undotted.denominator * defaultLength.numerator,
  });
  if (ratio.numerator === ratio.denominator) return "";

  if (ratio.numerator === 1 && isPowerOfTwo(ratio.denominator)) {
    const count = Math.log2(ratio.denominator);
    return Array.from({ length: count }, (_, index) => {
      const y = fontSize * 0.42 + index * 4;
      return `<line class="duration-line" x1="${round(centerX - fontSize * 0.34)}" y1="${round(y)}" x2="${round(centerX + fontSize * 0.34)}" y2="${round(y)}"/>`;
    }).join("");
  }

  const label = ratio.denominator === 1
    ? `×${ratio.numerator}`
    : `${ratio.numerator}/${ratio.denominator}`;
  return `<text class="duration-label" x="${round(centerX)}" y="${round(fontSize * 0.62)}">${label}</text>`;
}

function removeDots(duration: Fraction, dots: number): Fraction {
  if (dots === 0) return duration;
  const dotNumerator = 2 ** (dots + 1) - 1;
  const dotDenominator = 2 ** dots;
  return reduceFraction({
    numerator: duration.numerator * dotDenominator,
    denominator: duration.denominator * dotNumerator,
  });
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && Number.isInteger(Math.log2(value));
}

function formatFraction(value: Fraction): string {
  return `${value.numerator}/${value.denominator}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
