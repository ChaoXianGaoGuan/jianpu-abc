export type ScoreImageFormat = "svg" | "png";
export type ScoreNotationName = "jianpu" | "staff";

export interface SvgFragment {
  markup: string;
  width: number;
  height: number;
}

export interface RasterSize {
  width: number;
  height: number;
  scale: number;
}

export function composeSvgFragments(fragments: SvgFragment[], gap = 12): SvgFragment {
  if (fragments.length === 0) throw new Error("No rendered SVG is available to export.");
  const width = Math.max(...fragments.map((fragment) => fragment.width));
  const height = fragments.reduce((sum, fragment) => sum + fragment.height, 0)
    + gap * Math.max(0, fragments.length - 1);
  let y = 0;
  const content = fragments.map((fragment) => {
    const currentY = y;
    y += fragment.height + gap;
    return `<svg x="0" y="${round(currentY)}" width="${round(fragment.width)}" height="${round(fragment.height)}" viewBox="0 0 ${round(fragment.width)} ${round(fragment.height)}">${stripOuterSvg(fragment.markup)}</svg>`;
  }).join("");
  return {
    width,
    height,
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}">${content}</svg>`,
  };
}

export function rasterSize(
  sourceWidth: number,
  sourceHeight: number,
  requestedScale = 2,
  maxDimension = 16384,
  maxPixels = 32_000_000,
): RasterSize {
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new RangeError("SVG dimensions must be positive.");
  const dimensionScale = Math.min(maxDimension / sourceWidth, maxDimension / sourceHeight);
  const pixelScale = Math.sqrt(maxPixels / (sourceWidth * sourceHeight));
  const scale = Math.min(requestedScale, dimensionScale, pixelScale);
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
    scale,
  };
}

export function scoreImageFilename(
  title: string | undefined,
  notation: ScoreNotationName,
  format: ScoreImageFormat,
): string {
  const safeTitle = (title ?? "score")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    || "score";
  return `${safeTitle}-${notation}.${format}`;
}

function stripOuterSvg(markup: string): string {
  return markup
    .replace(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
