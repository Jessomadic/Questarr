import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Indexer } from "@shared/schema";

// Mock dependencies
vi.mock("../db.js", () => ({
  pool: {},
  db: {},
}));

vi.mock("../storage.js", () => ({
  storage: {
    getEnabledIndexers: vi.fn(),
  },
}));

vi.mock("../torznab.js", () => ({
  torznabClient: {
    searchMultipleIndexers: vi.fn(),
  },
}));

vi.mock("../newznab.js", () => ({
  newznabClient: {
    searchMultipleIndexers: vi.fn(),
  },
}));

const { searchAllIndexers, filterBlacklistedReleases } = await import("../search.js");
const { storage } = await import("../storage.js");
const { torznabClient } = await import("../torznab.js");
const { newznabClient } = await import("../newznab.js");

const makeTorznabIndexer = (overrides: Partial<Indexer> = {}): Indexer => ({
  id: "torznab-1",
  name: "Torznab Indexer",
  url: "http://torznab.example.com",
  apiKey: "key1",
  protocol: "torznab",
  enabled: true,
  priority: 1,
  categories: ["4000"],
  rssEnabled: true,
  autoSearchEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeNewznabIndexer = (overrides: Partial<Indexer> = {}): Indexer => ({
  id: "newznab-1",
  name: "Newznab Indexer",
  url: "http://newznab.example.com",
  apiKey: "key2",
  protocol: "newznab",
  enabled: true,
  priority: 1,
  categories: ["4000"],
  rssEnabled: true,
  autoSearchEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTorznabResponse = (items: object[], errors: string[] = []) => ({
  results: { items, total: items.length },
  errors,
});

const makeNewznabResponse = (items: object[], errors: string[] = []) => ({
  results: { items, total: items.length },
  errors,
});

describe("Search Module - searchAllIndexers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty results when no indexers are configured", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([]);

    const result = await searchAllIndexers({ query: "test game" });

    expect(result).toEqual({
      items: [],
      total: 0,
      offset: 0,
      errors: ["No indexers configured"],
      diagnostics: { attempts: [] },
    });
  });

  it("should search torznab indexers and return formatted results", async () => {
    const torznabIndexer = makeTorznabIndexer();

    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Test Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          leechers: 2,
          category: "4000",
          guid: "guid-123",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          indexerUrl: "http://torznab.example.com",
          comments: "http://torznab.example.com/details/guid-123",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: "Test Game",
      downloadType: "torrent",
      seeders: 10,
      leechers: 2,
    });
    expect(result.total).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("should search newznab indexers and return formatted results", async () => {
    const newznabIndexer = makeNewznabIndexer();

    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([newznabIndexer]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Test Usenet Game",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 5,
          age: 2.5,
          category: ["4000"],
          guid: "guid-456",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
          poster: "user@example.com",
          group: "alt.binaries.games",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: "Test Usenet Game",
      downloadType: "usenet",
      grabs: 5,
      age: 2.5,
      poster: "user@example.com",
      group: "alt.binaries.games",
    });
    expect(result.total).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("should combine results from both torznab and newznab indexers", async () => {
    const torznabIndexer = makeTorznabIndexer();
    const newznabIndexer = makeNewznabIndexer({ priority: 2 });

    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer, newznabIndexer]);

    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Torrent Game",
          link: "http://torrent.example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          category: "4000",
          guid: "guid-torrent",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
        },
      ])
    );

    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Usenet Game",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 5,
          category: ["4000"],
          guid: "guid-usenet",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].downloadType).toBe("usenet"); // Newer date, sorted first
    expect(result.items[1].downloadType).toBe("torrent");
    expect(result.total).toBe(2);
  });

  it("should sort results by date (newest first)", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Old Game",
          link: "http://example.com/old",
          pubDate: "2024-01-01T00:00:00Z",
          guid: "guid-old",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          category: "4000",
        },
        {
          title: "New Game",
          link: "http://example.com/new",
          pubDate: "2024-01-10T00:00:00Z",
          guid: "guid-new",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          category: "4000",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "game" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("New Game");
    expect(result.items[1].title).toBe("Old Game");
  });

  it("should sort accepted profile matches above newer rejected Newznab noise", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Test Game OST FLAC",
          link: "http://usenet.example.com/noise",
          publishDate: "2024-01-10T00:00:00Z",
          size: 2000000,
          grabs: 100,
          category: ["3000"],
          guid: "guid-noise",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
        {
          title: "Test Game Complete Edition PC",
          link: "http://usenet.example.com/game",
          publishDate: "2024-01-01T00:00:00Z",
          size: 2000000,
          grabs: 10,
          files: 12,
          category: ["4000"],
          guid: "guid-game",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("Test Game Complete Edition PC");
    expect(result.items[0].releaseDecision?.accepted).toBe(true);
    expect(result.items[1].releaseDecision?.accepted).toBe(false);
  });

  it("should downrank results that differ from the expected size by more than twenty percent", async () => {
    const expectedSize = 50 * 1024 ** 3;
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Test Game PC-GROUP",
          link: "http://usenet.example.com/right-size",
          publishDate: "2024-01-01T00:00:00Z",
          size: expectedSize,
          grabs: 5,
          category: ["4050"],
          guid: "guid-right-size",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
        {
          title: "Test Game PC-OTHER",
          link: "http://usenet.example.com/wrong-size",
          publishDate: "2024-01-02T00:00:00Z",
          size: expectedSize * 1.25,
          grabs: 10,
          category: ["4050"],
          guid: "guid-wrong-size",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game", expectedSize });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("Test Game PC-GROUP");
    expect(result.items[0].releaseDecision?.accepted).toBe(true);
    expect(result.items[1].releaseDecision?.accepted).toBe(false);
    expect(result.items[1].releaseDecision?.matchedFormats).toContain("Expected size mismatch");
  });

  it("should aggregate errors from indexers", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([], ["Connection timeout", "Rate limit exceeded"])
    );

    const result = await searchAllIndexers({ query: "test" });

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain("Connection timeout");
    expect(result.errors).toContain("Rate limit exceeded");
  });

  it("should construct comments URL when not provided by indexer", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Test Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          guid: "http://example.com/details/12345",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          indexerUrl: "http://torznab.example.com",
          category: "4000",
          // No comments field provided
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].comments).toBe("http://torznab.example.com/details/12345");
  });

  it("should handle limit and offset parameters", async () => {
    const torznabIndexer = makeTorznabIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(makeTorznabResponse([]));

    await searchAllIndexers({ query: "test", limit: 25, offset: 10 });

    expect(torznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [torznabIndexer],
      expect.objectContaining({
        limit: 35,
        offset: 0,
      })
    );
  });

  it("should use default limit of 50 when not specified", async () => {
    const torznabIndexer = makeTorznabIndexer();
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([torznabIndexer]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(makeTorznabResponse([]));

    await searchAllIndexers({ query: "test" });

    expect(torznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [torznabIndexer],
      expect.objectContaining({
        limit: 50,
        offset: 0,
      })
    );
  });
  it("should extract release group from title for torznab items", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Game.Title-RELGROUP",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          category: "4000",
          guid: "guid-123",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "test game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].group).toBe("RELGROUP");
  });

  it("should map downloadVolumeFactor and uploadVolumeFactor from torznab items", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Freeleech Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 10,
          leechers: 3,
          downloadVolumeFactor: 0,
          uploadVolumeFactor: 2,
          category: "4000",
          guid: "guid-free",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "freeleech game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].downloadVolumeFactor).toBe(0);
    expect(result.items[0].uploadVolumeFactor).toBe(2);
  });

  it("should pass through undefined downloadVolumeFactor when not provided by indexer", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeTorznabIndexer()]);
    vi.mocked(torznabClient.searchMultipleIndexers).mockResolvedValue(
      makeTorznabResponse([
        {
          title: "Normal Game",
          link: "http://example.com/download",
          pubDate: "2024-01-01T00:00:00Z",
          size: 1000000,
          seeders: 5,
          category: "4000",
          guid: "guid-normal",
          indexerId: "torznab-1",
          indexerName: "Torznab Indexer",
          // No downloadVolumeFactor / uploadVolumeFactor
        },
      ])
    );

    const result = await searchAllIndexers({ query: "normal game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].downloadVolumeFactor).toBeUndefined();
    expect(result.items[0].uploadVolumeFactor).toBeUndefined();
  });

  it("should map files from newznab items", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Usenet Game Complete",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 10,
          age: 1,
          files: 12,
          category: ["4000"],
          guid: "guid-nzb",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
        },
      ])
    );

    const result = await searchAllIndexers({ query: "usenet game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].files).toBe(12);
  });

  it("should pass through undefined files when not provided by newznab indexer", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(
      makeNewznabResponse([
        {
          title: "Usenet Game No Files",
          link: "http://usenet.example.com/nzb",
          publishDate: "2024-01-02T00:00:00Z",
          size: 2000000,
          grabs: 5,
          category: ["4000"],
          guid: "guid-nzb-nofiles",
          indexerId: "newznab-1",
          indexerName: "Newznab Indexer",
          // No files field
        },
      ])
    );

    const result = await searchAllIndexers({ query: "usenet game" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].files).toBeUndefined();
  });

  it("should retry a category-scoped zero-result search without categories", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers)
      .mockResolvedValueOnce(makeNewznabResponse([]))
      .mockResolvedValueOnce(
        makeNewznabResponse([
          {
            title: "Rare Game PC-GROUP",
            link: "http://usenet.example.com/rare",
            publishDate: "2024-01-02T00:00:00Z",
            size: 2000000,
            grabs: 5,
            category: [],
            guid: "guid-rare",
            indexerId: "newznab-1",
            indexerName: "Newznab Indexer",
          },
        ])
      );

    const result = await searchAllIndexers({ query: "rare game" });

    expect(result.items).toHaveLength(1);
    expect(newznabClient.searchMultipleIndexers).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({ name: "Newznab Indexer" })],
      expect.objectContaining({ disableCategoryFilter: true, category: undefined })
    );
    expect(result.diagnostics.attempts[1]).toMatchObject({
      categories: null,
      rawCount: 1,
      keptCount: 1,
    });
  });

  it("should not retry without categories when the caller supplied an explicit category", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([makeNewznabIndexer()]);
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([]));

    await searchAllIndexers({ query: "rare game", category: ["4050"], categoryWasExplicit: true });

    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledTimes(1);
    expect(newznabClient.searchMultipleIndexers).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "Newznab Indexer" })],
      expect.objectContaining({ category: ["4050"], disableCategoryFilter: false })
    );
  });

  it("should deduplicate repeated fallback results", async () => {
    vi.mocked(storage.getEnabledIndexers).mockResolvedValue([
      makeNewznabIndexer(),
      makeNewznabIndexer({ id: "newznab-2", name: "Newznab Mirror" }),
    ]);
    const item = {
      title: "Mirror Game PC-GROUP",
      link: "http://usenet.example.com/mirror",
      publishDate: "2024-01-02T00:00:00Z",
      size: 2000000,
      grabs: 5,
      category: ["4000"],
      guid: "same-guid",
      indexerId: "newznab-1",
      indexerName: "Newznab Indexer",
    };
    vi.mocked(newznabClient.searchMultipleIndexers).mockResolvedValue(makeNewznabResponse([item]));

    const result = await searchAllIndexers({ query: "mirror game" });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("filterBlacklistedReleases", () => {
  const makeItem = (title: string) => ({
    title,
    link: "http://example.com",
    downloadType: "torrent" as const,
  });

  it("returns all items when blacklist is empty", () => {
    const items = [makeItem("Game-GROUP"), makeItem("Game-OTHER")];
    expect(filterBlacklistedReleases(items, new Set())).toEqual(items);
  });

  it("filters out blacklisted titles", () => {
    const items = [makeItem("Game-GROUP"), makeItem("Game-OTHER")];
    const result = filterBlacklistedReleases(items, new Set(["Game-GROUP"]));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Game-OTHER");
  });

  it("returns empty array when all items are blacklisted", () => {
    const items = [makeItem("Game-A"), makeItem("Game-B")];
    const result = filterBlacklistedReleases(items, new Set(["Game-A", "Game-B"]));
    expect(result).toHaveLength(0);
  });

  it("is case-sensitive (does not filter non-matching case)", () => {
    const items = [makeItem("Game-GROUP")];
    const result = filterBlacklistedReleases(items, new Set(["game-group"]));
    expect(result).toHaveLength(1);
  });

  it("returns original array reference when blacklist is empty (fast path)", () => {
    const items = [makeItem("Game-GROUP")];
    const result = filterBlacklistedReleases(items, new Set());
    expect(result).toBe(items);
  });
});
