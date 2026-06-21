import { describe, expect, it } from "vitest";
import { parseJabc } from "../src/core/parser";
import {
  buildSourceEventRanges,
  sourceEventAtCaret,
  sourceEventById,
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
});
