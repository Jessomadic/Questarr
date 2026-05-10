import { describe, expect, it } from "vitest";
import { DEFAULT_CUSTOM_FORMATS, evaluateRelease } from "../release-profiles";

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

  it("rejects sequel and spin-off matches for base-title searches", () => {
    const sequel = evaluateRelease({
      title: "Dishonored.2.Deluxe.Edition-GROUP",
      gameTitle: "Dishonored",
      category: ["4000"],
      downloadType: "usenet",
    });
    const spinOff = evaluateRelease({
      title: "Dishonored.Death.of.the.Outsider-GROUP",
      gameTitle: "Dishonored",
      category: ["4000"],
      downloadType: "usenet",
    });

    expect(sequel.accepted).toBe(false);
    expect(sequel.titleMatch).toBe("ambiguous-title");
    expect(spinOff.accepted).toBe(false);
    expect(spinOff.rejectionReasons).toContain(
      "Release appears to be a sequel or spin-off of the requested game"
    );
  });

  it("accepts exact sequel and subtitle searches", () => {
    expect(
      evaluateRelease({
        title: "Dishonored.2.Deluxe.Edition-GROUP",
        gameTitle: "Dishonored 2",
        category: ["4000"],
        downloadType: "usenet",
      }).accepted
    ).toBe(true);
    expect(
      evaluateRelease({
        title: "Dishonored.Death.of.the.Outsider-GROUP",
        gameTitle: "Dishonored Death of the Outsider",
        category: ["4000"],
        downloadType: "usenet",
      }).accepted
    ).toBe(true);
  });

  it("allows metadata-only suffixes for base-title searches", () => {
    const decision = evaluateRelease({
      title: "Portal.Complete.Edition.GOG.Win64.MULTi.Repack.v1.2-GROUP",
      gameTitle: "Portal",
      category: ["4000"],
      downloadType: "usenet",
    });

    expect(decision.accepted).toBe(true);
    expect(decision.titleMatch).toBe("contains");
  });

  it("uses release group custom formats as score boosts", () => {
    const base = evaluateRelease({
      title: "Test.Game-GROUP",
      gameTitle: "Test Game",
      category: ["4000"],
      downloadType: "usenet",
    });
    const boosted = evaluateRelease(
      {
        title: "Test.Game-GROUP",
        gameTitle: "Test Game",
        category: ["4000"],
        downloadType: "usenet",
      },
      undefined,
      [
        ...DEFAULT_CUSTOM_FORMATS,
        {
          id: "group-boost",
          name: "Release group: GROUP",
          description: "",
          conditionType: "release_group",
          matcherMode: "exact",
          matcherValue: "GROUP",
          score: 75,
          enabled: true,
          hardReject: false,
          builtIn: false,
        },
      ]
    );

    expect(boosted.score).toBe(base.score + 75);
    expect(boosted.matchedFormats).toContain("Release group: GROUP");
  });
});
