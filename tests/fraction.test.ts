import { describe, expect, it } from "vitest";
import { multiplyFractions, parseFraction } from "../src/core/fraction";

describe("parseFraction", () => {
  it("parses and reduces a positive fraction", () => {
    expect(parseFraction("2/8")).toEqual({ numerator: 1, denominator: 4 });
  });

  it.each(["", "1", "0/4", "1/0", "a/b"])("rejects %j", (value) => {
    expect(parseFraction(value)).toBeUndefined();
  });

  it("multiplies and reduces fractions", () => {
    expect(multiplyFractions(
      { numerator: 1, denominator: 4 },
      { numerator: 3, denominator: 2 },
    )).toEqual({ numerator: 3, denominator: 8 });
  });
});
