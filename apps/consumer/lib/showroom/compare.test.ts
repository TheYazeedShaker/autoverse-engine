import { describe, expect, it } from "vitest";
import {
  COMPARE_LIMIT,
  COMPARE_MIN,
  compareHref,
  parseCompareParam,
  toggleCompare,
} from "./compare";
import { COPY } from "./copy";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const D = "00000000-0000-0000-0000-00000000000d";

describe("toggleCompare", () => {
  it("picks in order, a pair at most (owner decision B); unpicks", () => {
    let s: string[] = [];
    for (const id of [A, B, C, D]) s = toggleCompare(s, id, true);
    expect([COMPARE_LIMIT, COMPARE_MIN]).toEqual([2, 2]); // exactly a pair
    expect(s).toEqual([A, B]); // a third pick is refused
    expect(toggleCompare(s, B, false)).toEqual([A]);
    expect(toggleCompare(s, A, true)).toEqual([A, B]); // no duplicates
  });
});

describe("compareHref", () => {
  it("links from 2 picks, in pick order, with the language; null otherwise", () => {
    expect(compareHref("/compare", [A], "en")).toBeNull();
    expect(compareHref("/compare", [B, A], "en")).toBe(`/compare?trims=${B},${A}`);
    expect(compareHref("/compare", [A, B], "ar")).toBe(`/compare?trims=${A},${B}&lang=ar`);
    // The compare page's flag is off: no link at all.
    expect(compareHref(null, [A, B], "en")).toBeNull();
  });
});

describe("parseCompareParam", () => {
  it("keeps at most 2 distinct uuids, in order, and nothing else", () => {
    expect(parseCompareParam(`${A},${B}`)).toEqual([A, B]);
    expect(parseCompareParam(`${A},${A},${B},${C},${D}`)).toEqual([A, B]);
    expect(parseCompareParam(`${A},<script>,../x,${B.toUpperCase()}`)).toEqual([A, B]);
    expect(parseCompareParam(undefined)).toEqual([]);
    expect(parseCompareParam([A, B])).toEqual([]);
  });
});

describe("compare copy", () => {
  it("counts picks in both languages", () => {
    expect(COPY.en.compareStatus("1", 1)).toBe("1 trim selected for comparison");
    expect(COPY.en.compareStatus("2", 2)).toBe("2 trims selected for comparison");
    expect(COPY.en.compareStatus("0", 0)).toBe("No trims selected for comparison");
    expect(COPY.ar.compareStatus("٠", 0)).toBe("لا توجد فئات محددة للمقارنة");
    expect(COPY.ar.compareStatus("٢", 2)).toBe("فئتان محددتان للمقارنة");
    expect(COPY.ar.compareStatus("٣", 3)).toBe("٣ فئات محددة للمقارنة");
  });
});
