import { describe, expect, it } from "vitest";
import {
  bundledScoreLibrary,
  createScoreLibrary,
  filterScoreLibrary,
  isLibraryEditorDirty,
  scoreLibraryCategories,
} from "../src/web/score-library";

const TIGER = `T:两只老虎
C:传统儿歌
K:C jianpu
| 1 2 3 1 |`;

const SCALE = `T:Scale Study
K:C jianpu
| 1 2 3 4 |`;

describe("score library", () => {
  it("builds sorted entries from repository paths and score headers", () => {
    const result = createScoreLibrary({
      "../library/练习/scale.jabc": SCALE,
      "../library/儿歌/two-tigers.jabc": TIGER,
    });

    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      {
        id: "儿歌/two-tigers",
        category: "儿歌",
        title: "两只老虎",
        composer: "传统儿歌",
        source: TIGER,
      },
      {
        id: "练习/scale",
        category: "练习",
        title: "Scale Study",
        source: SCALE,
      },
    ]);
    expect(scoreLibraryCategories(result.entries)).toEqual(["儿歌", "练习"]);
  });

  it("searches title, composer, category, and id with case-insensitive matching", () => {
    const entries = createScoreLibrary({
      "../library/练习/scale-study.jabc": SCALE,
      "../library/儿歌/two-tigers.jabc": TIGER,
    }).entries;

    expect(filterScoreLibrary(entries, { query: "老虎" }).map((entry) => entry.id))
      .toEqual(["儿歌/two-tigers"]);
    expect(filterScoreLibrary(entries, { query: "SCALE" }).map((entry) => entry.id))
      .toEqual(["练习/scale-study"]);
    expect(filterScoreLibrary(entries, { query: "传统" }).map((entry) => entry.id))
      .toEqual(["儿歌/two-tigers"]);
    expect(filterScoreLibrary(entries, { category: "练习" }).map((entry) => entry.id))
      .toEqual(["练习/scale-study"]);
  });

  it("reports invalid files without hiding valid entries", () => {
    const result = createScoreLibrary({
      "../library/儿歌/two-tigers.jabc": TIGER,
      "../library/损坏/bad.jabc": "K:C jianpu\n| 8 |",
      "../library/损坏/not-text.jabc": { source: SCALE },
    });

    expect(result.entries.map((entry) => entry.id)).toEqual(["儿歌/two-tigers"]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((error) => error.id)).toEqual(["损坏/bad", "损坏/not-text"]);
  });

  it("detects editor changes relative to the loaded library source", () => {
    expect(isLibraryEditorDirty(TIGER, TIGER)).toBe(false);
    expect(isLibraryEditorDirty(`${TIGER}\n% edit`, TIGER)).toBe(true);
    expect(isLibraryEditorDirty(TIGER, undefined)).toBe(false);
  });

  it("parses every bundled repository score", () => {
    expect(bundledScoreLibrary.errors).toEqual([]);
    expect(bundledScoreLibrary.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "儿歌/two-tigers", title: "两只老虎" }),
      expect.objectContaining({
        id: "流行歌曲/yi-qian-nian-yi-hou",
        category: "流行歌曲",
        title: "一千年以后",
        composer: "林俊杰",
      }),
    ]));
  });
});
