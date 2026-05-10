import { describe, expect, it } from "vitest";
import { evaluateRelease } from "../release-profiles";

describe("release profile evaluation", () => {
  it("scores matching Newznab game releases above unrelated media", () => {
    const good = evaluateRelease({
      title: "Test.Game.Complete.Edition.PC-GRP",
      gameTitle: "Test Game",
      category: ["4000", "4050"],
      downloadType: "usenet",
      grabs: 42,
      files: 18,
    });
    const bad = evaluateRelease({
      title: "Test.Game.OST.FLAC.2024",
      gameTitle: "Test Game",
      category: ["3000"],
      downloadType: "usenet",
      grabs: 100,
      files: 4,
    });

    expect(good.accepted).toBe(true);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.accepted).toBe(false);
    expect(bad.rejectionReasons).toContain("Release looks like non-game media or extras");
  });

  it("rejects wrong game titles even when the indexer category is games", () => {
    const decision = evaluateRelease({
      title: "Different.Game.Windows",
      gameTitle: "Test Game",
      category: ["4000"],
      downloadType: "usenet",
      grabs: 20,
    });

    expect(decision.accepted).toBe(false);
    expect(decision.rejectionReasons).toContain("Release title does not match the game title");
  });

  it("downranks console releases when the default profile prefers PC", () => {
    const decision = evaluateRelease({
      title: "Test.Game.Switch",
      gameTitle: "Test Game",
      category: ["4000"],
      downloadType: "usenet",
      grabs: 20,
    });

    expect(decision.accepted).toBe(false);
    expect(decision.rejectionReasons).toContain("Release platform does not match PC");
  });
});
