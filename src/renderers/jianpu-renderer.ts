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
  alignMeasuresAcrossSystems?: boolean;
}

interface LayoutMeasure {
  measure: Measure;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  cellWidth: number;
}

interface PositionedEvent {
  event: MusicalEvent;
  eventIndex: number;
  centerX: number;
  slotCount: number;
  startTime: Fraction;
}

interface CrossMeasureTie {
  boundaryIndex: number;
  start: PositionedEvent;
  end: PositionedEvent;
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
  const metaY = score.header.title ? padding + 34 : padding;
  const musicTop = metaY + 64;
  const lineHeight = fontSize * (showLyrics ? 3.35 : 2.55);
  const title = score.header.title ?? "JABC score";
  const renderedVoices: string[] = [];
  let cursorY = musicTop;

  for (const [voiceIndex, voice] of score.voices.entries()) {
    if (score.voices.length > 1) {
      renderedVoices.push(`<text class="voice-label" x="${padding}" y="${round(cursorY - fontSize * 1.18)}">${escapeXml(voice.id)}</text>`);
    }
    const layout = layoutMeasures(
      voice,
      width,
      padding,
      cursorY,
      lineHeight,
      fontSize,
      beatDuration,
      alignMeasuresAcrossSystems,
    );
    const positionedByMeasure = layout.map((placed) => positionEvents(placed, beatDuration));
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
    renderHeader(score, width, padding, titleY, metaY),
    ...renderedVoices,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="jianpu-score">
  <style>
    .score-title{font:600 25px Georgia,'Songti SC',serif;fill:#20332b;text-anchor:middle}
    .score-meta{font:600 14px Inter,'Microsoft YaHei',sans-serif;fill:#52655c}
    .score-composer{font:13px Inter,'Microsoft YaHei',sans-serif;fill:#718078;text-anchor:end}
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
): LayoutMeasure[] {
  const availableWidth = width - padding * 2;
  const baseCellWidth = fontSize * 1.5;
  const barSpace = fontSize * 0.55;
  const measureGap = fontSize * 0.35;
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

    const systemMetrics = systems.map((system) => system.map(({ measure }) => {
      const slotCount = measureSlotCount(measure, beatDuration);
      return { slotCount, naturalWidth: slotCount * baseCellWidth + barSpace };
    }));
    const alignedColumnWidths = alignMeasuresAcrossSystems
      ? columnWidths(systemMetrics)
      : [];

    let systemY = musicTop;
    for (const [systemIndex, system] of systems.entries()) {
      const metrics = systemMetrics[systemIndex] ?? [];
      const naturalWidths = alignMeasuresAcrossSystems
        ? metrics.map((_, index) => alignedColumnWidths[index] ?? 0)
        : metrics.map((metric) => metric.naturalWidth);
      const naturalTotal = naturalWidths.reduce((sum, measureWidth) => sum + measureWidth, 0)
        + Math.max(0, system.length - 1) * measureGap;
      const scale = Math.min(1, availableWidth / naturalTotal);
      const scaledGap = measureGap * scale;
      let systemX = padding;
      for (const [index, item] of system.entries()) {
        const metric = metrics[index] as { slotCount: number; naturalWidth: number };
        const naturalWidth = naturalWidths[index] ?? metric.naturalWidth;
        const measureWidth = naturalWidth * scale;
        const scaledBarSpace = barSpace * scale;
        const cellWidth = Math.max(
          fontSize * 0.34,
          (measureWidth - scaledBarSpace) / metric.slotCount,
        );
        output.push({
          measure: item.measure,
          measureIndex: item.measureIndex,
          x: systemX,
          y: systemY,
          width: measureWidth,
          cellWidth,
        });
        systemX += measureWidth + scaledGap;
      }
      systemY += lineHeight;
    }
    return output;
  }

  let x = padding;
  let y = musicTop;

  for (const [measureIndex, measure] of voice.measures.entries()) {
    const slotCount = measureSlotCount(measure, beatDuration);
    const naturalWidth = slotCount * baseCellWidth + barSpace;
    const measureWidth = Math.min(availableWidth, naturalWidth);
    const cellWidth = (measureWidth - barSpace) / slotCount;
    if (x > padding && x + measureWidth > width - padding) {
      x = padding;
      y += lineHeight;
    }
    output.push({ measure, measureIndex, x, y, width: measureWidth, cellWidth });
    x += measureWidth + measureGap;
  }
  return output;
}

function columnWidths(
  systemMetrics: Array<Array<{ slotCount: number; naturalWidth: number }>>,
): number[] {
  const output: number[] = [];
  for (const metrics of systemMetrics) {
    for (const [index, metric] of metrics.entries()) {
      output[index] = Math.max(output[index] ?? 0, metric.naturalWidth);
    }
  }
  return output;
}

function measureSlotCount(measure: Measure, beatDuration: Fraction): number {
  return Math.max(
    1,
    measure.events.reduce((total, event) => total + visualSlotCount(event, beatDuration), 0),
  );
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
      fontSize,
      showLyrics,
      eventId === highlightEventId,
    );
  }).join("");
  const durationLines = renderDurationLines(positioned, beatDuration, fontSize);
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

function positionEvents(placed: LayoutMeasure, beatDuration: Fraction): PositionedEvent[] {
  let slotOffset = 0;
  let startTime: Fraction = { numerator: 0, denominator: 1 };
  return placed.measure.events.map((event, eventIndex) => {
    const slotCount = visualSlotCount(event, beatDuration);
    const positioned: PositionedEvent = {
      event,
      eventIndex,
      centerX: (slotOffset + 0.5) * placed.cellWidth,
      slotCount,
      startTime,
    };
    slotOffset += slotCount;
    if (event.type !== "key-change") startTime = addFractions(startTime, event.duration);
    return positioned;
  });
}

function renderEvent(
  positioned: PositionedEvent,
  eventId: string,
  cellWidth: number,
  fontSize: number,
  showLyrics: boolean,
  highlighted: boolean,
): string {
  const { event, centerX, slotCount } = positioned;
  const symbol = event.type === "note"
    ? String(event.degree)
    : event.type === "rest" ? "0" : event.type === "extension" ? "−" : `1=${event.key.tonic}`;
  const className = highlighted ? "jabc-event is-highlighted" : "jabc-event";
  const backgroundHeight = fontSize * (showLyrics ? 2.45 : 1.75);
  const dots = event.type === "note" || event.type === "rest" ? event.dots ?? 0 : 0;
  const visualWidth = slotCount * cellWidth;
  const parts = [
    `<rect class="event-bg" x="${round(centerX - cellWidth * 0.4)}" y="${round(-fontSize * 1.25)}" width="${round(visualWidth - cellWidth * 0.2)}" height="${round(backgroundHeight)}" rx="7"/>`,
    `<text class="${event.type === "key-change" ? "event-key-change" : "event-symbol"}" x="${round(centerX)}" y="0">${symbol}</text>`,
  ];

  for (let index = 1; index < slotCount; index += 1) {
    parts.push(`<text class="duration-extension" x="${round(centerX + index * cellWidth)}" y="0">−</text>`);
  }

  if (event.type === "note") {
    if (event.accidental) {
      parts.push(`<text class="event-accidental" x="${round(centerX - fontSize * 0.55)}" y="${round(-fontSize * 0.08)}">${ACCIDENTAL_TEXT[event.accidental]}</text>`);
    }
    parts.push(renderOctaveDots(centerX, event.octaveShift, fontSize));
  }
  if (dots > 0) {
    for (let index = 0; index < dots; index += 1) {
      parts.push(`<circle class="duration-dot" cx="${round(centerX + fontSize * (0.48 + index * 0.24))}" cy="${round(-fontSize * 0.38)}" r="${round(fontSize * 0.09)}"/>`);
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

      output.push(renderDurationLine(group, lineLevel, fontSize));
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

function renderDurationLine(
  group: PositionedEvent[],
  lineLevel: number,
  fontSize: number,
): string {
  const startX = group[0]!.centerX - fontSize * 0.34;
  const endX = group.at(-1)!.centerX + fontSize * 0.34;
  const y = fontSize * 0.43 + (lineLevel - 1) * 4.5;
  return `<line class="duration-line" data-line-level="${lineLevel}" data-group-size="${group.length}" x1="${round(startX)}" y1="${round(y)}" x2="${round(endX)}" y2="${round(y)}"/>`;
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
  if (event.type === "key-change") return 1;
  if (event.type === "extension") return 1;
  const ratio = divideFractions(notationDuration(event), beatDuration);
  return ratio.denominator === 1 && ratio.numerator > 1 ? ratio.numerator : 1;
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
