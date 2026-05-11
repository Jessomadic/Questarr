import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetWantedGamesGroupedByUser = vi.fn();
const mockSearchAllIndexers = vi.fn();
const mockAddDownloadWithFallback = vi.fn();

vi.mock("../storage.js", () => ({
  storage: {
    getWantedGamesGroupedByUser: mockGetWantedGamesGroupedByUser,
  },
}));

vi.mock("../search.js", () => ({
  searchAllIndexers: mockSearchAllIndexers,
  filterBlacklistedReleases: vi.fn((items) => items),
}));

vi.mock("../downloaders.js", () => ({
  DownloaderManager: {
    addDownloadWithFallback: mockAddDownloadWithFallback,
  },
}));

vi.mock("../logger.js", () => ({
  igdbLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../socket.js", () => ({
  notifyUser: vi.fn(),
}));

vi.mock("../igdb.js", () => ({
  igdbClient: {},
  IGDB_EARLY_ACCESS_STATUS: "early_access",
}));

vi.mock("../xrel.js", () => ({
  xrelClient: {},
  DEFAULT_XREL_BASE: "https://xrel.to",
}));

vi.mock("../steam.js", () => ({
  steamService: {},
}));

describe("Cron - checkAutoSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not run searches or downloads while automation is disabled", async () => {
    const { checkAutoSearch } = await import("../cron.js");

    await checkAutoSearch();

    expect(mockGetWantedGamesGroupedByUser).not.toHaveBeenCalled();
    expect(mockSearchAllIndexers).not.toHaveBeenCalled();
    expect(mockAddDownloadWithFallback).not.toHaveBeenCalled();
  });
});
