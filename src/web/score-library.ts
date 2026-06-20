import { parseJabc } from "../core/parser";

export interface ScoreLibraryEntry {
  id: string;
  category: string;
  title: string;
  composer?: string;
  source: string;
}

export interface ScoreLibraryError {
  id: string;
  message: string;
}

export interface ScoreLibraryResult {
  entries: ScoreLibraryEntry[];
  errors: ScoreLibraryError[];
}

export interface ScoreLibraryFilter {
  query?: string;
  category?: string;
}

const bundledModules = import.meta.glob("../library/**/*.jabc", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const bundledScoreLibrary = createScoreLibrary(bundledModules);

export function createScoreLibrary(modules: Record<string, unknown>): ScoreLibraryResult {
  const entries: ScoreLibraryEntry[] = [];
  const errors: ScoreLibraryError[] = [];

  for (const [path, value] of Object.entries(modules)) {
    const id = libraryId(path);
    if (typeof value !== "string") {
      errors.push({ id, message: "曲谱文件未能作为文本读取。" });
      continue;
    }

    const result = parseJabc(value);
    if (!result.success) {
      const message = result.errors
        .map((error) => `第 ${error.line} 行 ${error.column} 列：${error.message}`)
        .join("\n");
      errors.push({ id, message });
      continue;
    }

    const title = result.value.header.title?.trim() || fileStem(id);
    const composer = result.value.header.composer?.trim();
    entries.push({
      id,
      category: libraryCategory(id),
      title,
      ...(composer ? { composer } : {}),
      source: value,
    });
  }

  entries.sort(compareLibraryEntries);
  errors.sort((left, right) => left.id.localeCompare(right.id, "zh-CN"));
  return { entries, errors };
}

export function filterScoreLibrary(
  entries: ScoreLibraryEntry[],
  filter: ScoreLibraryFilter,
): ScoreLibraryEntry[] {
  const query = normalizeSearch(filter.query ?? "");
  const category = filter.category ?? "";
  return entries.filter((entry) => {
    if (category !== "" && entry.category !== category) return false;
    if (query === "") return true;
    const haystack = normalizeSearch([
      entry.title,
      entry.composer ?? "",
      entry.category,
      entry.id,
    ].join(" "));
    return haystack.includes(query);
  });
}

export function scoreLibraryCategories(entries: ScoreLibraryEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.category))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function isLibraryEditorDirty(value: string, loadedSource: string | undefined): boolean {
  return loadedSource !== undefined && value !== loadedSource;
}

function libraryId(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const marker = "/library/";
  const markerIndex = normalized.lastIndexOf(marker);
  const relative = markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : normalized.replace(/^\.\.\/library\//, "").replace(/^\.\//, "");
  return relative.replace(/\.jabc$/i, "");
}

function libraryCategory(id: string): string {
  const parts = id.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "未分类";
}

function fileStem(id: string): string {
  return id.split("/").at(-1) ?? id;
}

function compareLibraryEntries(left: ScoreLibraryEntry, right: ScoreLibraryEntry): number {
  return left.category.localeCompare(right.category, "zh-CN")
    || left.title.localeCompare(right.title, "zh-CN")
    || left.id.localeCompare(right.id, "zh-CN");
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}
