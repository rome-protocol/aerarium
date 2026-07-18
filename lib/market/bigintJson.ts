// Tagged-string codec for bigints across the JSON boundary.
//
// JSON.stringify THROWS on a raw bigint, and a Number() "fix" loses precision
// past 2^53 — which on a lending UI means wrong supply / borrow / capacity. So
// the shared market payload carries the raw ReserveReads bigints tagged as
// {"__bigint__":"<decimal>"} on the way out (serializeBigints, at the route) and
// restores them on the way in (reviveBigints, in useMarket).

const TAG = "__bigint__";

export function serializeBigints(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    typeof val === "bigint" ? { [TAG]: val.toString() } : val,
  );
}

export function reviveBigints<T = unknown>(text: string): T {
  return JSON.parse(text, (_key, val) => {
    if (val !== null && typeof val === "object" && typeof (val as Record<string, unknown>)[TAG] === "string") {
      return BigInt((val as Record<string, string>)[TAG]);
    }
    return val;
  }) as T;
}
