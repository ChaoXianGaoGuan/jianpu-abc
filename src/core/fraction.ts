import type { Fraction } from "./ast";

export const DEFAULT_NOTE_LENGTH: Fraction = { numerator: 1, denominator: 4 };

export function parseFraction(value: string): Fraction | undefined {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value.trim());
  if (!match) return undefined;

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (numerator < 1 || denominator < 1) return undefined;

  return reduceFraction({ numerator, denominator });
}

export function reduceFraction(value: Fraction): Fraction {
  const divisor = gcd(value.numerator, value.denominator);
  return {
    numerator: value.numerator / divisor,
    denominator: value.denominator / divisor,
  };
}

export function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  return reduceFraction({
    numerator: left.numerator * right.numerator,
    denominator: left.denominator * right.denominator,
  });
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}
