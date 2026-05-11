import { describe, expect, it } from "vitest";
import { buildSearchQueriesForTitle } from "../title-utils";

describe("buildSearchQueriesForTitle", () => {
  it("keeps the exact title first and adds a punctuation-normalized retry", () => {
    expect(buildSearchQueriesForTitle("Sid Meier's Civilization VI")).toEqual([
      "Sid Meier's Civilization VI",
      "sid meier s civilization vi",
    ]);
  });

  it("adds conservative base-title retries for subtitles and edition suffixes", () => {
    expect(buildSearchQueriesForTitle("Control: Ultimate Edition")).toEqual([
      "Control: Ultimate Edition",
      "control ultimate edition",
      "Control",
    ]);
  });

  it("does not broaden numeric sequel titles", () => {
    expect(buildSearchQueriesForTitle("Dishonored 2")).toEqual(["Dishonored 2"]);
  });

  it("deduplicates equivalent query attempts", () => {
    expect(buildSearchQueriesForTitle("Portal")).toEqual(["Portal"]);
  });
});
