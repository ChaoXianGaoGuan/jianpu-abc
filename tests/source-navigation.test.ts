import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import {
  buildLyricSourceRanges,
  buildSourceEventRanges,
  sourceEventAtCaret,
  sourceEventById,
  sourceEventForMeasureCaret,
  sourceLyricAtCaret,
  sourceLyricByEventId,
} from "../src/web/source-navigation";

function parse(source: string) {
  const result = parseJabc(source);
  if (!result.success) throw new Error(result.errors[0]?.message ?? "Parse failed");
  return result.value;
}

describe("source navigation", () => {
  it("maps multiline and multi-voice events to UTF-16 textarea offsets", () => {
    const source = "T:中文标题\nK:C jianpu\nV:lead\n| #4'e. 0 |\nV:bass\n| 1, - |";
    const ranges = buildSourceEventRanges(parse(source), source);

    expect(ranges.map(({ eventId, start, end }) => ({
      eventId,
      text: source.slice(start, end),
    }))).toEqual([
      { eventId: "lead:0:0", text: "#4'e." },
      { eventId: "lead:0:1", text: "0" },
      { eventId: "bass:0:0", text: "1," },
      { eventId: "bass:0:1", text: "-" },
    ]);
  });

  it("matches token boundaries but not surrounding whitespace or headers", () => {
    const source = "T:Test\nK:C jianpu\n| 1e  2 |";
    const ranges = buildSourceEventRanges(parse(source), source);
    const first = ranges[0]!;

    expect(sourceEventAtCaret(ranges, first.start)?.eventId).toBe("default:0:0");
    expect(sourceEventAtCaret(ranges, first.start + 1)?.eventId).toBe("default:0:0");
    expect(sourceEventAtCaret(ranges, first.end)?.eventId).toBe("default:0:0");
    expect(sourceEventAtCaret(ranges, first.end + 1)).toBeUndefined();
    expect(sourceEventAtCaret(ranges, 2)).toBeUndefined();
    expect(sourceEventById(ranges, "default:0:1")?.eventId).toBe("default:0:1");
  });

  it("maps lyric syllable tokens to lyric units with continuations", () => {
    const source = "K:C jianpu\n| 1 - 2~ | ~2 (4 5) 6. |\nw: 长 连 啊 点";
    const ranges = buildLyricSourceRanges(parse(source), source);

    expect(ranges.map(({ start, end, eventIds }) => ({
      text: source.slice(start, end),
      eventIds,
    }))).toEqual([
      { text: "长", eventIds: ["default:0:0", "default:0:1"] },
      { text: "连", eventIds: ["default:0:2", "default:1:0"] },
      { text: "啊", eventIds: ["default:1:1", "default:1:2"] },
      { text: "点", eventIds: ["default:1:3"] },
    ]);
    expect(sourceLyricAtCaret(ranges, source.indexOf("连"))?.eventIds).toEqual([
      "default:0:2",
      "default:1:0",
    ]);
    expect(sourceLyricByEventId(ranges, "default:1:2")?.syllableIndex).toBe(2);
  });

  it("stops lyric unit extensions at repeat navigation markers", () => {
    const source = "K:C jianpu\n| 1 7 !D.S.! - 5 |\nw: 无 法 突";
    const ranges = buildLyricSourceRanges(parse(source), source);

    expect(ranges.map(({ start, end, eventIds }) => ({
      text: source.slice(start, end),
      eventIds,
    }))).toEqual([
      { text: "无", eventIds: ["default:0:0"] },
      { text: "法", eventIds: ["default:0:1"] },
      { text: "突", eventIds: ["default:0:4"] },
    ]);
  });

  it("resolves measure preview targets from lyric syllable tokens", () => {
    const source = "K:C jianpu\n| 1 2 | 3 4 |\nw: 一 二 三 四";
    const score = parse(source);
    const eventRanges = buildSourceEventRanges(score, source);
    const lyricRanges = buildLyricSourceRanges(score, source);

    expect(sourceEventForMeasureCaret(
      eventRanges,
      lyricRanges,
      source.indexOf("一"),
    )?.eventId).toBe("default:0:0");
    expect(sourceEventForMeasureCaret(
      eventRanges,
      lyricRanges,
      source.indexOf("三"),
    )?.eventId).toBe("default:1:0");
  });

  it("keeps extra lyric lines navigable only when they own a music row", () => {
    const source = "K:C jianpu\n| 1 2 |\nw: 一 二\nw: 重 复\n| 3 4 |\nw: 三 四";
    const ranges = buildLyricSourceRanges(parse(source), source);

    expect(ranges.map(({ start, end, eventIds }) => ({
      text: source.slice(start, end),
      eventIds,
    }))).toEqual([
      { text: "一", eventIds: ["default:0:0"] },
      { text: "二", eventIds: ["default:0:1"] },
      { text: "三", eventIds: ["default:1:0"] },
      { text: "四", eventIds: ["default:1:1"] },
    ]);
  });
});
