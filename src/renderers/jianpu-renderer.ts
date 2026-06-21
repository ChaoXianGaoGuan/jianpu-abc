import type {
  Accidental,
  Fraction,
  Measure,
  MusicalEvent,
  NoteEvent,
  RestEvent,
  Score,
  Voice,
} from "../core/ast";
import { DEFAULT_NOTE_LENGTH, reduceFraction } from "../core/fraction";
import {
  layoutMeasures as buildLayoutMeasures,
  positionEvents as buildPositionedEvents,
  type LayoutMeasure,
  type PositionedEvent,
} from "./jianpu-layout";

export interface RenderOptions {
  width?: number;
  fontSize?: number;
  showLyrics?: boolean;
  highlightEventId?: string;
  alignMeasuresAcrossSystems?: boolean;
}

interface CrossMeasureTie {
  boundaryIndex: number;
  start: PositionedEvent;
  end: PositionedEvent;
}

interface MeasureLayoutMetric {
  slotCount: number;
  naturalWidth: number;
  beatGapCount: number;
  cellWidth: number;
}

const ACCIDENTAL_TEXT: Record<Accidental, string> = {
  sharp: "♯",
  flat: "♭",
  natural: "♮",
  "double-sharp": "𝄪",
  "double-flat": "𝄫",
};

export function renderJianpu(score: Score, options: RenderOptions = {}): string {
  const width = Math.max(320, options.width ?? 900);
  const fontSize = Math.max(18, options.fontSize ?? 32);
  const showLyrics = options.showLyrics ?? true;
  const alignMeasuresAcrossSystems = options.alignMeasuresAcrossSystems ?? true;
  const padding = Math.max(24, fontSize);
  const defaultLength = score.header.defaultNoteLength ?? DEFAULT_NOTE_LENGTH;
  const beatDuration = score.header.meter
    ? { numerator: 1, denominator: score.header.meter.denominator }
    : defaultLength;
  const titleY = padding;
  const metaY = score.header.title ? padding + fontSize * 1.2 : padding;
  const musicTop = metaY + fontSize * 2;
  const lineHeight = fontSize * (showLyrics ? 3.35 : 2.55);
  const minCellWidth = fontSize * 0.62;
  const title = score.header.title ?? "JABC score";
  const renderedVoices: string[] = [];
  let renderedWidth = width;
  let cursorY = musicTop;

  for (const [voiceIndex, voice] of score.voices.entries()) {
    if (score.voices.length > 1) {
      renderedVoices.push(`<text class="voice-label" x="${padding}" y="${round(cursorY - fontSize * 1.18)}">${escapeXml(voice.id)}</text>`);
    }
    const layout = buildLayoutMeasures(
      voice.measures,
      width,
      padding,
      cursorY,
      lineHeight,
      fontSize,
      beatDuration,
      alignMeasuresAcrossSystems,
      minCellWidth,
    );
    renderedWidth = Math.max(renderedWidth, ...layout.map((placed) => placed.x + placed.width + padding * 0.2));
    const positionedByMeasure = layout.map((placed) => buildPositionedEvents(placed, beatDuration, fontSize));
    const crossMeasureTies = findCrossMeasureTies(layout, positionedByMeasure);
    const connectedBoundaries = new Set(
      crossMeasureTies.map((connection) => connection.boundaryIndex),
    );
    renderedVoices.push(...layout.map((placed, measureIndex) => {
      const previous = layout[measureIndex - 1];
      const next = layout[measureIndex + 1];
      const sharedLeftBarlineX = placed.measure.leftBarline !== undefined
        && previous !== undefined
        && previous.y === placed.y
        ? previous.x + previous.width - fontSize * 0.22 - placed.x
        : undefined;
      const suppressRightBarline = placed.measure.barline?.type === "single"
        && next?.measure.leftBarline !== undefined
        && next.y === placed.y;
      return renderMeasure(
        voice,
        placed,
        positionedByMeasure[measureIndex] ?? [],
        beatDuration,
        fontSize,
        showLyrics,
        options.highlightEventId,
        connectedBoundaries.has(measureIndex - 1),
        connectedBoundaries.has(measureIndex),
        suppressRightBarline,
        sharedLeftBarlineX,
      );
    }));
    renderedVoices.push(renderCrossMeasureTies(crossMeasureTies, layout, fontSize));
    const lastLineY = layout.at(-1)?.y ?? cursorY;
    cursorY = lastLineY + lineHeight + (voiceIndex === score.voices.length - 1 ? 0 : fontSize * 0.9);
  }

  const height = Math.ceil(cursorY + padding * 0.4);
  const content = [
    renderHeader(score, renderedWidth, padding, titleY, metaY, fontSize),
    ...renderedVoices,
  ].join("");

  const displayScale = Math.min(1, width / renderedWidth);
  const displayHeight = Math.ceil(height * displayScale);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" viewBox="0 0 ${round(renderedWidth)} ${height}" width="100%" height="${displayHeight}" class="jianpu-score">
  <style>
    .score-title{font:600 ${round(fontSize * 0.95)}px Georgia,'Songti SC',serif;fill:#20332b;text-anchor:middle}
    .score-meta{font:650 ${round(fontSize * 0.56)}px Inter,'Microsoft YaHei',sans-serif;fill:#52655c}
    .score-composer{font:600 ${round(fontSize * 0.5)}px Inter,'Microsoft YaHei',sans-serif;fill:#718078;text-anchor:end}
    .voice-label{font:700 13px ui-monospace,Consolas,monospace;fill:#a4522c}
    .barline-thin,.barline-thick,.ending-bracket{stroke:#33483f;fill:none}
    .barline-thin{stroke-width:1.6}
    .barline-thick{stroke-width:4.2}
    .repeat-dot{fill:#33483f}
    .ending-bracket{stroke-width:1.5;stroke-linecap:square;stroke-linejoin:miter}
    .ending-number{font:700 ${fontSize * 0.45}px Georgia,'Songti SC',serif;fill:#33483f}
    .event-bg{fill:transparent;transition:fill .12s ease}
    .event-symbol,.duration-extension{font:600 ${fontSize}px 'Microsoft YaHei','Noto Sans SC',sans-serif;fill:#1f332a;text-anchor:middle}
    .event-key-change{font:700 ${fontSize * 0.48}px Inter,'Microsoft YaHei',sans-serif;fill:#a4522c;text-anchor:middle}
    .event-accidental{font:700 ${fontSize * 0.8}px 'Bravura','Noto Music','Segoe UI Symbol',Georgia,serif;fill:#1f332a;text-anchor:middle;dominant-baseline:middle}
    .octave-dot,.duration-dot{fill:#1f332a}
    .duration-line{stroke:#1f332a;stroke-width:1.7;stroke-linecap:round}
    .relation-arc{fill:none;stroke:#35483f;stroke-width:1.8;stroke-linecap:round}
    .relation-arc-mask{fill:none;stroke:#fffef9;stroke-width:5.5;stroke-linecap:round}
    .tie-arc{stroke-width:1.45}
    .slur-arc{stroke-width:1.5}
    .tuplet-arc{stroke-width:1.4}
    .tuplet-number{font:700 ${fontSize * 0.48}px Georgia,serif;fill:#35483f;text-anchor:middle;dominant-baseline:middle}
    .event-lyric{font:15px 'Microsoft YaHei','Noto Sans SC',sans-serif;fill:#4f6259;text-anchor:middle}
    .is-source-active .event-bg{fill:#cfe5da;stroke:#4e8069;stroke-width:1.2}
    .is-source-active .event-symbol,.is-source-active .event-accidental,.is-source-active .duration-extension{fill:#245b45}
    .is-highlighted .event-bg{fill:#f7d98b}
    .is-highlighted .event-symbol,.is-highlighted .event-accidental,.is-highlighted .duration-extension{fill:#8d3f23}
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
  beatDuration: Fraction,
  alignMeasuresAcrossSystems: boolean,
  minCellWidth: number,
): LayoutMeasure[] {
  const availableWidth = width - padding * 2;
  const baseCellWidth = fontSize * 1.5;
  const barSpace = fontSize * 0.55;
  const measureGap = fontSize * 0.35;
  const beatGap = fontSize * 0.28;
  const output: LayoutMeasure[] = [];
  const hasExplicitSystems = voice.measures
    .slice(0, -1)
    .some((measure) => measure.systemBreakAfter);

  if (hasExplicitSystems) {
    const systems: Array<Array<{ measure: Measure; measureIndex: number }>> = [];
    let currentSystem: Array<{ measure: Measure; measureIndex: number }> = [];
    for (const [measureIndex, measure] of voice.measures.entries()) {
      currentSystem.push({ measure, measureIndex });
      if (measure.systemBreakAfter) {
        systems.push(currentSystem);
        currentSystem = [];
      }
    }
    if (currentSystem.length > 0) systems.push(currentSystem);

    const systemMetrics = systems.map((system) => system.map(({ measure }) =>
      measureLayoutMetric(measure, beatDuration, fontSize, baseCellWidth, barSpace)
    ));
    const alignedColumnWidths = alignMeasuresAcrossSystems
      ? columnWidths(systemMetrics)
      : [];
    const alignedReadableColumnWidths = alignMeasuresAcrossSystems
      ? columnReadableWidths(systemMetrics, minCellWidth, beatGap, barSpace)
      : [];

    const targetAvailableWidth = alignMeasuresAcrossSystems
      ? availableWidth
      : Math.max(
        availableWidth,
        ...systemMetrics.map((metrics) =>
          metrics.reduce(
            (sum, metric) => sum + readableMeasureWidth(metric, minCellWidth, beatGap, barSpace),
            0,
          ) + Math.max(0, metrics.length - 1) * measureGap
        ),
      );

    let systemY = musicTop;
    for (const [systemIndex, system] of systems.entries()) {
      const metrics = systemMetrics[systemIndex] ?? [];
      const naturalWidths = alignMeasuresAcrossSystems
        ? metrics.map((metric, index) => alignedColumnWidths[index] ?? metric.naturalWidth)
        : metrics.map((metric) => metric.naturalWidth);
      const readableWidths = alignMeasuresAcrossSystems
        ? metrics.map((metric, index) => alignedReadableColumnWidths[index] ?? readableMeasureWidth(metric, minCellWidth, beatGap, barSpace))
        : metrics.map((metric) => readableMeasureWidth(metric, minCellWidth, beatGap, barSpace));
      const naturalTotal = naturalWidths.reduce((sum, measureWidth) => sum + measureWidth, 0)
        + Math.max(0, system.length - 1) * measureGap;
      const scale = alignMeasuresAcrossSystems || naturalTotal <= 0
        ? 1
        : targetAvailableWidth / naturalTotal;
      const scaledGap = measureGap * scale;
      let systemX = padding;
      for (const [index, item] of system.entries()) {
        const metric = metrics[index] as MeasureLayoutMetric;
        const naturalWidth = naturalWidths[index] ?? metric.naturalWidth;
        const readableWidth = readableWidths[index] ?? readableMeasureWidth(metric, minCellWidth, beatGap, barSpace);
        const scaledBarSpace = barSpace * scale;
        const scaledBeatGap = beatGap * scale;
        const measureWidth = Math.max(
          naturalWidth * scale,
          alignMeasuresAcrossSystems ? readableWidth : readableMeasureWidth(metric, minCellWidth, scaledBeatGap, scaledBarSpace),
        );
        const cellWidth = Math.max(
          minCellWidth,
          (measureWidth - scaledBarSpace - metric.beatGapCount * scaledBeatGap) / metric.slotCount,
        );
        output.push({
          measure: item.measure,
          measureIndex: item.measureIndex,
          x: systemX,
          y: systemY,
          width: measureWidth,
          cellWidth,
          beatGap: scaledBeatGap,
        });
        systemX += measureWidth + scaledGap;
      }
      systemY += lineHeight;
    }
    return output;
  }

  const rows: Array<Array<{
    measure: Measure;
    measureIndex: number;
    metric: MeasureLayoutMetric;
    measureWidth: number;
  }>> = [];
  let currentRow: Array<{
    measure: Measure;
    measureIndex: number;
    metric: MeasureLayoutMetric;
    measureWidth: number;
  }> = [];
  let currentRowWidth = 0;

  for (const [measureIndex, measure] of voice.measures.entries()) {
    const metric = measureLayoutMetric(
      measure,
      beatDuration,
      fontSize,
      baseCellWidth,
      barSpace,
    );
    const measureWidth = Math.max(
      Math.min(availableWidth, metric.naturalWidth),
      readableMeasureWidth(metric, minCellWidth, beatGap, barSpace),
    );
    const nextRowWidth = currentRowWidth
      + (currentRow.length === 0 ? 0 : measureGap)
      + measureWidth;
    if (currentRow.length > 0 && nextRowWidth > availableWidth) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }
    currentRow.push({ measure, measureIndex, metric, measureWidth });
    currentRowWidth += (currentRow.length === 1 ? 0 : measureGap) + measureWidth;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const targetAvailableWidth = alignMeasuresAcrossSystems
    ? availableWidth
    : Math.max(
      availableWidth,
      ...rows.map((row) =>
        row.reduce((sum, item) => sum + item.measureWidth, 0)
        + Math.max(0, row.length - 1) * measureGap
      ),
    );

  let y = musicTop;
  for (const row of rows) {
    const naturalTotal = row.reduce((sum, item) => sum + item.measureWidth, 0)
      + Math.max(0, row.length - 1) * measureGap;
    const scale = alignMeasuresAcrossSystems || naturalTotal <= 0
      ? 1
      : targetAvailableWidth / naturalTotal;
    const scaledGap = measureGap * scale;
    const scaledBarSpace = barSpace * scale;
    const scaledBeatGap = beatGap * scale;
    let x = padding;
    for (const item of row) {
      const measureWidth = item.measureWidth * scale;
      const cellWidth = Math.max(
        minCellWidth,
        (measureWidth - scaledBarSpace - item.metric.beatGapCount * scaledBeatGap)
          / item.metric.slotCount,
      );
      output.push({
        measure: item.measure,
        measureIndex: item.measureIndex,
        x,
        y,
        width: measureWidth,
        cellWidth,
        beatGap: scaledBeatGap,
      });
      x += measureWidth + scaledGap;
    }
    y += lineHeight;
  }
  return output;
}

function readableMeasureWidth(
  metric: MeasureLayoutMetric,
  minCellWidth: number,
  beatGap: number,
  barSpace: number,
): number {
  const readableCellWidth = Math.max(minCellWidth, metric.cellWidth * 0.72);
  return metric.slotCount * readableCellWidth + metric.beatGapCount * beatGap + barSpace;
}

function columnWidths(
  systemMetrics: MeasureLayoutMetric[][],
): number[] {
  const output: number[] = [];
  for (const metrics of systemMetrics) {
    for (const [index, metric] of metrics.entries()) {
      output[index] = Math.max(output[index] ?? 0, metric.naturalWidth);
    }
  }
  return output;
}

function columnReadableWidths(
  systemMetrics: MeasureLayoutMetric[][],
  minCellWidth: number,
  beatGap: number,
  barSpace: number,
): number[] {
  const output: number[] = [];
  for (const metrics of systemMetrics) {
    for (const [index, metric] of metrics.entries()) {
      output[index] = Math.max(
        output[index] ?? 0,
        readableMeasureWidth(metric, minCellWidth, beatGap, barSpace),
      );
    }
  }
  return output;
}

function measureLayoutMetric(
  measure: Measure,
  beatDuration: Fraction,
  fontSize: number,
  baseCellWidth: number,
  barSpace: number,
): MeasureLayoutMetric {
  const layoutSpans = measureEventLayoutSpans(measure, beatDuration);
  const slotCount = Math.max(1, layoutSpans.reduce((total, span) => total + span, 0));
  const beatGapCount = measureBeatGapCount(slotCount);
  const cellWidth = measure.events.reduce((requiredWidth, event, index) => {
    if (event.type === "key-change") return requiredWidth;
    const span = Math.min(1, layoutSpans[index] ?? eventLayoutSpan(event, beatDuration));
    const minimumEventWidth = fontSize * (
      event.type === "note" && event.accidental !== undefined ? 1 : 0.82
    );
    return Math.max(requiredWidth, minimumEventWidth / span);
  }, baseCellWidth);
  return {
    slotCount,
    naturalWidth: slotCount * cellWidth + beatGapCount * fontSize * 0.28 + barSpace,
    beatGapCount,
    cellWidth,
  };
}

function measureBeatGapCount(slotCount: number): number {
  return Math.max(0, Math.ceil(slotCount - 1e-9) - 1);
}

function renderHeader(
  score: Score,
  width: number,
  padding: number,
  titleY: number,
  metaY: number,
  fontSize: number,
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
    const metaGap = fontSize * 0.95;
    const metaContent = meta.map((value, index) =>
      `<tspan${index === 0 ? "" : ` dx="${round(metaGap)}"`}>${escapeXml(value)}</tspan>`
    ).join("");
    lines.push(`<text class="score-meta" x="${padding}" y="${round(metaY)}">${metaContent}</text>`);
  }
  if (score.header.composer) {
    lines.push(`<text class="score-composer" x="${width - padding}" y="${metaY}">${escapeXml(score.header.composer)}</text>`);
  }
  return lines.join("");
}

function renderMeasure(
  voice: Voice,
  placed: LayoutMeasure,
  positioned: PositionedEvent[],
  beatDuration: Fraction,
  fontSize: number,
  showLyrics: boolean,
  highlightEventId: string | undefined,
  suppressIncomingTie: boolean,
  suppressOutgoingTie: boolean,
  suppressRightBarline: boolean,
  leftBarlineX: number | undefined,
): string {
  const events = positioned.map((item) => {
    const eventId = `${voice.id}:${placed.measureIndex}:${item.eventIndex}`;
    return renderEvent(
      item,
      eventId,
      placed.cellWidth,
      placed.beatGap,
      fontSize,
      showLyrics,
      eventId === highlightEventId,
    );
  }).join("");
  const rightBarlineX = placed.measure.barline
    ? placed.width - fontSize * 0.22
    : undefined;
  const durationLines = renderDurationLines(positioned, beatDuration, fontSize, rightBarlineX);
  const relations = renderRelations(
    positioned,
    placed.width,
    fontSize,
    suppressIncomingTie,
    suppressOutgoingTie,
  );
  const leftBarline = placed.measure.leftBarline
    ? renderBarline(placed.measure.leftBarline, "left", placed.width, fontSize, leftBarlineX)
    : "";
  const ending = placed.measure.ending
    ? renderEnding(placed.measure.ending.number, placed.width, fontSize)
    : "";
  const barline = placed.measure.barline && !suppressRightBarline
    ? renderBarline(placed.measure.barline, "right", placed.width, fontSize)
    : "";
  return `<g class="measure" data-measure-index="${placed.measureIndex}" transform="translate(${round(placed.x)} ${round(placed.y)})">${leftBarline}${ending}${events}${durationLines}${relations}${barline}</g>`;
}

function renderBarline(
  barline: NonNullable<Measure["barline"]>,
  side: "left" | "right",
  measureWidth: number,
  fontSize: number,
  leftBoundaryX = 0,
): string {
  const boundary = side === "left" ? leftBoundaryX : measureWidth - fontSize * 0.22;
  const top = -fontSize * 1.02;
  const bottom = fontSize * 0.58;
  const offset = fontSize * 0.17;
  const parts: string[] = [];
  const line = (className: string, x: number) =>
    `<line class="${className}" x1="${round(x)}" y1="${round(top)}" x2="${round(x)}" y2="${round(bottom)}"/>`;

  if (barline.type === "single") {
    parts.push(line("barline-thin", boundary));
  } else if (barline.type === "double") {
    parts.push(line("barline-thin", boundary - offset));
    parts.push(line("barline-thin", boundary));
  } else if (barline.type === "final" || barline.type === "repeat-end") {
    parts.push(line("barline-thin", boundary - offset));
    parts.push(line("barline-thick", boundary));
  } else {
    parts.push(line("barline-thick", boundary));
    parts.push(line("barline-thin", boundary + offset));
  }

  if (barline.type === "repeat-start" || barline.type === "repeat-end") {
    const dotX = barline.type === "repeat-start"
      ? boundary + fontSize * 0.34
      : boundary - fontSize * 0.34;
    for (const dotY of [-fontSize * 0.5, -fontSize * 0.1]) {
      parts.push(`<circle class="repeat-dot" cx="${round(dotX)}" cy="${round(dotY)}" r="${round(fontSize * 0.065)}"/>`);
    }
  }

  return `<g class="barline barline-${barline.type}" data-barline="${barline.sourceText}">${parts.join("")}</g>`;
}

function renderEnding(number: string, measureWidth: number, fontSize: number): string {
  const startX = fontSize * 0.06;
  const endX = measureWidth - fontSize * 0.3;
  const top = -fontSize * 1.86;
  const down = -fontSize * 1.52;
  return `<g class="ending" data-ending="${escapeXml(number)}">
    <path class="ending-bracket" d="M ${round(startX)} ${round(down)} L ${round(startX)} ${round(top)} L ${round(endX)} ${round(top)}"/>
    <text class="ending-number" x="${round(startX + fontSize * 0.2)}" y="${round(-fontSize * 1.48)}">${escapeXml(number)}.</text>
  </g>`;
}

function positionEvents(placed: LayoutMeasure, beatDuration: Fraction, fontSize: number): PositionedEvent[] {
  let slotOffset = 0;
  let startTime: Fraction = { numerator: 0, denominator: 1 };
  const layoutSpans = measureEventLayoutSpans(placed.measure, beatDuration);
  return placed.measure.events.map((event, eventIndex) => {
    const slotCount = visualSlotCount(event, beatDuration);
    const layoutSpan = layoutSpans[eventIndex] ?? eventLayoutSpan(event, beatDuration);
    const dots = event.type === "note" || event.type === "rest" ? event.dots ?? 0 : 0;
    const visualUnitSpan = layoutSpan / (dots + 1);
    const markerSpan = event.type === "key-change"
      ? nextTimedLayoutSpan(placed.measure.events, layoutSpans, eventIndex, beatDuration)
      : visualUnitSpan;
    const centerX = layoutXAt(
      slotOffset + Math.min(markerSpan, 1) / 2,
      placed.cellWidth,
      placed.beatGap,
    );
    const dotXs: number[] = [];
    for (let index = 0; index < dots; index += 1) {
      dotXs.push(centerX + fontSize * (0.40 + index * 0.20));
    }
    const positioned: PositionedEvent = {
      event,
      eventIndex,
      centerX,
      slotCount,
      layoutSpan,
      layoutOffset: slotOffset,
      dotXs,
      startTime,
    };
    if (event.type !== "key-change") {
      slotOffset += layoutSpan;
      startTime = addFractions(startTime, event.duration);
    }
    return positioned;
  });
}

function nextTimedLayoutSpan(
  events: MusicalEvent[],
  layoutSpans: number[],
  eventIndex: number,
  beatDuration: Fraction,
): number {
  for (let index = eventIndex + 1; index < events.length; index += 1) {
    const event = events[index] as MusicalEvent;
    if (event.type === "key-change") continue;
    return layoutSpans[index] ?? eventLayoutSpan(event, beatDuration);
  }
  return 1;
}

function layoutXAt(offset: number, cellWidth: number, beatGap: number): number {
  const completedBeats = Math.max(0, Math.floor(offset - 1e-9));
  return offset * cellWidth + completedBeats * beatGap;
}

function renderEvent(
  positioned: PositionedEvent,
  eventId: string,
  cellWidth: number,
  beatGap: number,
  fontSize: number,
  showLyrics: boolean,
  highlighted: boolean,
): string {
  const { event, centerX, slotCount, layoutSpan, layoutOffset, dotXs } = positioned;
  const symbol = event.type === "note"
    ? String(event.degree)
    : event.type === "rest" ? "0" : event.type === "extension" ? "−" : `1=${event.key.tonic}`;
  const className = highlighted ? "jabc-event is-highlighted" : "jabc-event";
  const backgroundHeight = fontSize * (showLyrics ? 2.45 : 1.75);
  const dots = event.type === "note" || event.type === "rest" ? event.dots ?? 0 : 0;
  if (event.type === "key-change") {
    return `<g class="${className}" data-event-id="${escapeXml(eventId)}" aria-label="${escapeXml(event.sourceText ?? symbol)}"><text class="event-key-change" x="${round(centerX)}" y="${round(-fontSize * 1.42)}">${symbol}</text></g>`;
  }

  const visualStartX = layoutXAt(layoutOffset, cellWidth, beatGap);
  const visualEndX = layoutXAt(layoutOffset + layoutSpan, cellWidth, beatGap);
  const visualWidth = visualEndX - visualStartX;
  const parts = [
    `<rect class="event-bg" x="${round(visualStartX + visualWidth * 0.1)}" y="${round(-fontSize * 1.25)}" width="${round(visualWidth * 0.8)}" height="${round(backgroundHeight)}" rx="7"/>`,
    `<text class="event-symbol" x="${round(centerX)}" y="0">${symbol}</text>`,
  ];

  for (let index = 1; index < slotCount; index += 1) {
    const extensionX = layoutXAt(layoutOffset + index + 0.5, cellWidth, beatGap);
    parts.push(`<text class="duration-extension" x="${round(extensionX)}" y="0">−</text>`);
  }

  if (event.type === "note") {
    if (event.accidental) {
      parts.push(`<text class="event-accidental" x="${round(centerX - fontSize * 0.38)}" y="${round(-fontSize * 0.45)}">${ACCIDENTAL_TEXT[event.accidental]}</text>`);
    }
    parts.push(renderOctaveDots(centerX, event.octaveShift, fontSize));
  }
  if (dots > 0) {
    for (let index = 0; index < dots; index += 1) {
      parts.push(`<circle class="duration-dot" cx="${round(dotXs[index] ?? centerX)}" cy="${round(-fontSize * 0.38)}" r="${round(fontSize * 0.09)}"/>`);
    }
  }
  if (showLyrics && event.type === "note" && event.lyric) {
    parts.push(`<text class="event-lyric" x="${round(centerX)}" y="${round(fontSize * 1.5)}">${escapeXml(event.lyric)}</text>`);
  }

  return `<g class="${className}" data-event-id="${escapeXml(eventId)}" aria-label="${escapeXml(event.sourceText ?? symbol)}">${parts.join("")}</g>`;
}

function renderDurationLines(
  positioned: PositionedEvent[],
  beatDuration: Fraction,
  fontSize: number,
  rightBarlineX: number | undefined,
): string {
  const output: string[] = [];
  const maxLevel = positioned.reduce(
    (level, item) => Math.max(level, durationLineCount(item.event, beatDuration)),
    0,
  );

  for (let lineLevel = 1; lineLevel <= maxLevel; lineLevel += 1) {
    let index = 0;
    while (index < positioned.length) {
      const first = positioned[index] as PositionedEvent;
      if (!hasDurationLine(first, beatDuration, lineLevel)) {
        index += 1;
        continue;
      }

      const group = [first];
      if (isDurationLineJoinable(first)) {
        while (index + group.length < positioned.length) {
          const next = positioned[index + group.length] as PositionedEvent;
          if (
            !isDurationLineJoinable(next)
            || !hasDurationLine(next, beatDuration, lineLevel)
            || beatIndex(next.startTime, beatDuration) !== beatIndex(first.startTime, beatDuration)
          ) break;
          group.push(next);
        }
      }

      const previousBoundary = closestDurationLineItem(positioned, index - 1, -1, beatDuration, 1);
      const nextBoundary = closestDurationLineItem(positioned, index + group.length, 1, beatDuration, 1);
      const firstBeat = beatIndex(first.startTime, beatDuration);
      const lastBeat = beatIndex(group.at(-1)!.startTime, beatDuration);
      const startsAfterBeatBoundary = previousBoundary !== undefined
        && beatIndex(previousBoundary.startTime, beatDuration) !== firstBeat;
      const endsBeforeBeatBoundary = nextBoundary !== undefined
        && beatIndex(nextBoundary.startTime, beatDuration) !== lastBeat;
      const maxEndX = nextBoundary === undefined && rightBarlineX !== undefined
        ? rightBarlineX - fontSize * 0.32
        : undefined;

      output.push(renderDurationLine(group, lineLevel, fontSize, {
        startsAfterBeatBoundary,
        endsBeforeBeatBoundary,
        ...(maxEndX === undefined ? {} : { maxEndX }),
      }));
      index += group.length;
    }
  }
  return output.join("");
}

function hasDurationLine(
  item: PositionedEvent,
  beatDuration: Fraction,
  lineLevel: number,
): boolean {
  return durationLineCount(item.event, beatDuration) >= lineLevel;
}

function isDurationLineJoinable(item: PositionedEvent): boolean {
  return item.event.type === "note" || item.event.type === "rest";
}

function closestDurationLineItem(
  positioned: PositionedEvent[],
  startIndex: number,
  step: -1 | 1,
  beatDuration: Fraction,
  lineLevel: number,
): PositionedEvent | undefined {
  for (let index = startIndex; index >= 0 && index < positioned.length; index += step) {
    const item = positioned[index] as PositionedEvent;
    if (hasDurationLine(item, beatDuration, lineLevel)) return item;
  }
  return undefined;
}

function renderDurationLine(
  group: PositionedEvent[],
  lineLevel: number,
  fontSize: number,
  options: {
    startsAfterBeatBoundary?: boolean;
    endsBeforeBeatBoundary?: boolean;
    maxEndX?: number;
  } = {},
): string {
  const beatBoundaryInset = fontSize * 0.14;
  const startX = group[0]!.centerX - fontSize * 0.34
    + (options.startsAfterBeatBoundary ? beatBoundaryInset : 0);
  const last = group.at(-1)!;
  const rawEndX = durationLineEndX(last, fontSize)
    - (options.endsBeforeBeatBoundary ? beatBoundaryInset : 0);
  const maxEndX = options.maxEndX ?? rawEndX;
  const endX = Math.max(startX + fontSize * 0.18, Math.min(rawEndX, maxEndX));
  const y = fontSize * 0.43 + (lineLevel - 1) * 4.5;
  return `<line class="duration-line" data-line-level="${lineLevel}" data-group-size="${group.length}" x1="${round(startX)}" y1="${round(y)}" x2="${round(endX)}" y2="${round(y)}"/>`;
}

function durationLineEndX(item: PositionedEvent, fontSize: number): number {
  const dots = item.event.type === "note" || item.event.type === "rest" ? item.event.dots ?? 0 : 0;
  const symbolPadding = dots > 0 ? 0.66 + (dots - 1) * 0.18 : 0.34;
  return item.centerX + fontSize * symbolPadding;
}

function renderRelations(
  positioned: PositionedEvent[],
  measureWidth: number,
  fontSize: number,
  suppressIncomingTie: boolean,
  suppressOutgoingTie: boolean,
): string {
  const output: string[] = [];
  output.push(...renderSlurArcs(positioned, measureWidth, fontSize));
  output.push(...renderTieArcs(
    positioned,
    measureWidth,
    fontSize,
    suppressIncomingTie,
    suppressOutgoingTie,
  ));

  let tupletStart: PositionedEvent | undefined;
  for (const item of positioned) {
    if (item.event.type === "extension" || item.event.type === "key-change") continue;
    if (item.event.tuplet?.position === "start") tupletStart = item;
    if (item.event.tuplet?.position === "end" && tupletStart) {
      output.push(renderTupletArc(
        tupletStart.centerX,
        item.centerX,
        item.event.tuplet.actual,
        fontSize,
      ));
      tupletStart = undefined;
    }
  }
  return output.join("");
}

function renderSlurArcs(
  positioned: PositionedEvent[],
  measureWidth: number,
  fontSize: number,
): string[] {
  const output: string[] = [];
  const inset = fontSize * 0.28;
  let open: PositionedEvent | undefined;
  for (const item of positioned) {
    if (item.event.type !== "note") continue;
    if (item.event.slurEnd) {
      const x1 = open ? open.centerX + inset : fontSize * 0.08;
      const x2 = Math.max(x1 + fontSize * 0.2, item.centerX - inset);
      const y1 = open ? slurEndpointY(open, fontSize) : -fontSize * 1.02;
      const y2 = slurEndpointY(item, fontSize);
      output.push(cubicArcPath("slur-arc", x1, y1, x2, y2, fontSize));
      open = undefined;
    }
    if (item.event.slurStart) open = item;
  }
  if (open) {
    output.push(cubicArcPath(
      "slur-arc",
      open.centerX + inset,
      slurEndpointY(open, fontSize),
      measureWidth - fontSize * 0.42,
      -fontSize * 1.02,
      fontSize,
    ));
  }
  return output;
}

function slurEndpointY(item: PositionedEvent, fontSize: number): number {
  return item.event.type === "note" && item.event.octaveShift > 0
    ? -fontSize * (1.08 + (item.event.octaveShift - 1) * 0.16)
    : -fontSize * 0.82;
}

function cubicArcPath(
  className: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fontSize: number,
): string {
  const span = Math.max(fontSize * 0.2, x2 - x1);
  const archHeight = Math.min(fontSize * 0.52, Math.max(fontSize * 0.26, span * 0.08));
  const peak = Math.min(y1, y2) - archHeight;
  const controlInset = span * 0.3;
  return `<path class="relation-arc ${className}" d="M ${round(x1)} ${round(y1)} C ${round(x1 + controlInset)} ${round(peak)} ${round(x2 - controlInset)} ${round(peak)} ${round(x2)} ${round(y2)}"/>`;
}

function renderTupletArc(
  startCenterX: number,
  endCenterX: number,
  number: number,
  fontSize: number,
): string {
  const x1 = startCenterX - fontSize * 0.18;
  const x2 = endCenterX + fontSize * 0.18;
  const mid = (x1 + x2) / 2;
  const gap = fontSize * 0.28;
  const y = -fontSize * 1.18;
  const peak = -fontSize * 1.48;
  const leftControl = (x1 + mid - gap) / 2;
  const rightControl = (mid + gap + x2) / 2;
  return [
    `<path class="relation-arc tuplet-arc" d="M ${round(x1)} ${round(y)} Q ${round(leftControl)} ${round(peak)} ${round(mid - gap)} ${round(peak)}"/>`,
    `<path class="relation-arc tuplet-arc" d="M ${round(mid + gap)} ${round(peak)} Q ${round(rightControl)} ${round(peak)} ${round(x2)} ${round(y)}"/>`,
    `<text class="tuplet-number" x="${round(mid)}" y="${round(peak + fontSize * 0.02)}">${number}</text>`,
  ].join("");
}

function renderTieArcs(
  positioned: PositionedEvent[],
  measureWidth: number,
  fontSize: number,
  suppressIncoming: boolean,
  suppressOutgoing: boolean,
): string[] {
  const output: string[] = [];
  const y = -fontSize * 0.82;
  const peak = -fontSize * 1.04;
  const preferredInset = fontSize * 0.28;
  let open: PositionedEvent | undefined;

  for (const item of positioned) {
    if (item.event.type !== "note") continue;
    if (item.event.tieEnd) {
      if (open) {
        const availableInset = Math.max(
          0,
          (item.centerX - open.centerX) / 2 - fontSize * 0.08,
        );
        const inset = Math.min(preferredInset, availableInset);
        output.push(arcPath(
          "tie-arc",
          open.centerX + inset,
          item.centerX - inset,
          y,
          peak,
        ));
      } else if (!suppressIncoming) {
        output.push(arcPath(
          "tie-arc",
          fontSize * 0.08,
          Math.max(fontSize * 0.14, item.centerX - preferredInset),
          y,
          peak,
        ));
      }
      open = undefined;
    }
    if (item.event.tieStart) open = item;
  }

  if (open && !suppressOutgoing) {
    output.push(arcPath(
      "tie-arc",
      open.centerX + preferredInset,
      Math.max(open.centerX + preferredInset + fontSize * 0.12, measureWidth - fontSize * 0.65),
      y,
      peak,
    ));
  }
  return output;
}

function findCrossMeasureTies(
  layout: LayoutMeasure[],
  positionedByMeasure: PositionedEvent[][],
): CrossMeasureTie[] {
  const output: CrossMeasureTie[] = [];
  for (let boundaryIndex = 0; boundaryIndex < layout.length - 1; boundaryIndex += 1) {
    const currentLayout = layout[boundaryIndex] as LayoutMeasure;
    const nextLayout = layout[boundaryIndex + 1] as LayoutMeasure;
    if (currentLayout.y !== nextLayout.y) continue;
    const start = unmatchedTieStart(positionedByMeasure[boundaryIndex] ?? []);
    const end = unmatchedTieEnd(positionedByMeasure[boundaryIndex + 1] ?? []);
    if (start && end) output.push({ boundaryIndex, start, end });
  }
  return output;
}

function unmatchedTieStart(positioned: PositionedEvent[]): PositionedEvent | undefined {
  let open: PositionedEvent | undefined;
  for (const item of positioned) {
    if (item.event.type !== "note") continue;
    if (item.event.tieEnd) open = undefined;
    if (item.event.tieStart) open = item;
  }
  return open;
}

function unmatchedTieEnd(positioned: PositionedEvent[]): PositionedEvent | undefined {
  let hasLocalStart = false;
  for (const item of positioned) {
    if (item.event.type !== "note") continue;
    if (item.event.tieEnd) {
      if (!hasLocalStart) return item;
      hasLocalStart = false;
    }
    if (item.event.tieStart) hasLocalStart = true;
  }
  return undefined;
}

function renderCrossMeasureTies(
  ties: CrossMeasureTie[],
  layout: LayoutMeasure[],
  fontSize: number,
): string {
  return ties.map((tie) => {
    const currentLayout = layout[tie.boundaryIndex] as LayoutMeasure;
    const nextLayout = layout[tie.boundaryIndex + 1] as LayoutMeasure;
    return crossMeasureTiePath(
      currentLayout.x + tie.start.centerX + fontSize * 0.28,
      nextLayout.x + tie.end.centerX - fontSize * 0.28,
      currentLayout.y - fontSize * 0.82,
      fontSize,
    );
  }).join("");
}

function crossMeasureTiePath(
  x1: number,
  x2: number,
  y: number,
  fontSize: number,
): string {
  const span = x2 - x1;
  const peak = y - Math.min(fontSize * 0.55, Math.max(fontSize * 0.34, span * 0.1));
  const controlInset = span * 0.32;
  const d = `M ${round(x1)} ${round(y)} C ${round(x1 + controlInset)} ${round(peak)} ${round(x2 - controlInset)} ${round(peak)} ${round(x2)} ${round(y)}`;
  return `<path class="relation-arc-mask cross-measure-tie-mask" d="${d}"/><path class="relation-arc tie-arc cross-measure-tie" d="${d}"/>`;
}

function arcPath(
  className: string,
  x1: number,
  x2: number,
  y: number,
  peak: number,
): string {
  const mid = (x1 + x2) / 2;
  return `<path class="relation-arc ${className}" d="M ${round(x1)} ${round(y)} Q ${round(mid)} ${round(peak)} ${round(x2)} ${round(y)}"/>`;
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

function visualSlotCount(event: MusicalEvent, beatDuration: Fraction): number {
  if (event.type === "key-change") return 0;
  if (event.type === "extension") return 1;
  const ratio = divideFractions(notationDuration(event), beatDuration);
  return ratio.denominator === 1 && ratio.numerator > 1 ? ratio.numerator : 1;
}

function eventLayoutSpan(event: MusicalEvent, beatDuration: Fraction): number {
  if (event.type === "key-change") return 0;
  const ratio = divideFractions(event.duration, beatDuration);
  return ratio.numerator / ratio.denominator;
}

function measureEventLayoutSpans(measure: Measure, beatDuration: Fraction): number[] {
  const spans = measure.events.map((event) => eventLayoutSpan(event, beatDuration));
  const groups = new Map<number, number[]>();
  let elapsed: Fraction = { numerator: 0, denominator: 1 };

  for (const [index, event] of measure.events.entries()) {
    if (event.type === "key-change") continue;
    const indexInBeat = beatIndex(elapsed, beatDuration);
    const group = groups.get(indexInBeat) ?? [];
    group.push(index);
    groups.set(indexInBeat, group);
    elapsed = addFractions(elapsed, event.duration);
  }

  for (const indices of groups.values()) {
    if (indices.length !== 2) continue;
    const firstIndex = indices[0]!;
    const secondIndex = indices[1]!;
    const first = measure.events[firstIndex]!;
    const second = measure.events[secondIndex]!;
    if (!isNoteOrRest(first) || !isNoteOrRest(second)) continue;
    const dottedIndex = (first.dots ?? 0) === 1
      ? firstIndex
      : (second.dots ?? 0) === 1 ? secondIndex : undefined;
    if (dottedIndex === undefined) continue;
    const plainIndex = dottedIndex === firstIndex ? secondIndex : firstIndex;
    const dotted = dottedIndex === firstIndex ? first : second;
    const plain = plainIndex === firstIndex ? first : second;
    if ((plain.dots ?? 0) !== 0) continue;
    const dottedBaseSpan = undottedLayoutSpan(dotted, beatDuration);
    const plainSpan = eventLayoutSpan(plain, beatDuration);
    const totalSpan = (spans[dottedIndex] ?? 0) + plainSpan;
    if (
      Math.abs(totalSpan - 1) > 1e-9
      || Math.abs(dottedBaseSpan - plainSpan * 2) > 1e-9
    ) continue;
    spans[dottedIndex] = 2 / 3;
    spans[plainIndex] = 1 / 3;
  }
  return spans;
}

function isNoteOrRest(event: MusicalEvent): event is NoteEvent | RestEvent {
  return event.type === "note" || event.type === "rest";
}

function undottedLayoutSpan(event: MusicalEvent, beatDuration: Fraction): number {
  if (event.type === "key-change" || event.type === "extension") {
    return eventLayoutSpan(event, beatDuration);
  }
  const duration = removeDots(event.duration, event.dots ?? 0);
  const ratio = divideFractions(duration, beatDuration);
  return ratio.numerator / ratio.denominator;
}

function durationLineCount(event: MusicalEvent, beatDuration: Fraction): number {
  if (event.type === "key-change" || event.type === "extension") return 0;
  const subdivisions = divideFractions(beatDuration, notationDuration(event));
  return subdivisions.denominator === 1 && isPowerOfTwo(subdivisions.numerator)
    ? Math.log2(subdivisions.numerator)
    : 0;
}

function notationDuration(event: MusicalEvent): Fraction {
  if (event.type === "key-change") return { numerator: 0, denominator: 1 };
  if (event.type === "extension") return event.duration;
  let duration = removeDots(event.duration, event.dots ?? 0);
  if (event.tuplet) {
    duration = reduceFraction({
      numerator: duration.numerator * event.tuplet.actual,
      denominator: duration.denominator * event.tuplet.normal,
    });
  }
  return duration;
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

function addFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}

function divideFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.denominator,
    denominator: left.denominator * right.numerator,
  });
}

function beatIndex(startTime: Fraction, beatDuration: Fraction): number {
  const ratio = divideFractions(startTime, beatDuration);
  return Math.floor(ratio.numerator / ratio.denominator);
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
