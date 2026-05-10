import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { DEFAULT_NEWZNAB_GAME_CATEGORIES, newznabClient } from "../newznab.js";

vi.mock("../ssrf.js", () => ({
  isSafeUrl: vi.fn(),
  safeFetch: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  routesLogger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { isSafeUrl, safeFetch } from "../ssrf.js";

const mockIndexer = {
  id: 1,
  name: "My Newznab",
  url: "http://example.com/api",
  apiKey: "secret",
  protocol: "newznab" as const,
  enabled: true,
  priority: 1,
  rssEnabled: true,
  autoSearchEnabled: true,
  categories: [],
};

const mockCapsXml = `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="My Newznab" />
  <categories>
    <category id="1000" name="Console">
      <subcat id="1010" name="NDS"/>
      <subcat id="1020" name="PSP"/>
    </category>
    <category id="4000" name="PC">
      <subcat id="4050" name="Games"/>
    </category>
  </categories>
</caps>`;

const mockSearchXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/dtd/2010/newznab/1.0">
  <channel>
    <title>My Newznab</title>
    <item>
      <title>Test Game</title>
      <guid isPermaLink="true">123456</guid>
      <link>http://example.com/get/123456</link>
      <pubDate>Thu, 21 Feb 2026 12:00:00 +0000</pubDate>
      <category>4000</category>
      <category>4050</category>
      <enclosure url="http://example.com/get/123456" length="102400" type="application/x-nzb" />
      <newznab:attr name="category" value="4000" />
      <newznab:attr name="category" value="4050" />
      <newznab:attr name="size" value="102400" />
      <newznab:attr name="grabs" value="5" />
      <newznab:attr name="files" value="1" />
      <newznab:attr name="poster" value="poster@example.com" />
      <newznab:attr name="group" value="alt.binaries.games" />
    </item>
  </channel>
</rss>`;

const mockSearchXmlWithCategoryLabel = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:newznab="http://www.newznab.com/dtd/2010/newznab/1.0">
  <channel>
    <title>My Newznab</title>
    <item>
      <title>DISHONORED.2-STEAMPUNKS</title>
      <guid isPermaLink="true">789</guid>
      <link>http://example.com/get/789</link>
      <pubDate>Thu, 21 Feb 2026 12:00:00 +0000</pubDate>
      <category>PC &gt; Games</category>
      <enclosure url="http://example.com/get/789" length="102400" type="application/x-nzb" />
      <newznab:attr name="category" value="4050" />
      <newznab:attr name="size" value="102400" />
    </item>
  </channel>
</rss>`;

describe("NewznabClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("search", () => {
    it("should reject unsafe URLs", async () => {
      (isSafeUrl as Mock).mockResolvedValue(false);

      await expect(newznabClient.search(mockIndexer, { query: "test" })).rejects.toThrow(
        "Unsafe URL detected"
      );
    });

    it("should search successfully and parse results", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockSearchXml,
      });

      const results = await newznabClient.search(mockIndexer, {
        query: "test",
        limit: 10,
        offset: 0,
      });

      expect(safeFetch).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Test Game");
      expect(results[0].size).toBe(102400);
      expect(results[0].grabs).toBe(5);
      expect(results[0].files).toBe(1);
      expect(results[0].category).toContain("4000");
    });

    it("should preserve category labels and extract numeric category attrs", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockSearchXmlWithCategoryLabel,
      });

      const results = await newznabClient.search(mockIndexer, {
        query: "dishonored 2",
        category: ["4000"],
      });

      expect(results).toHaveLength(1);
      expect(results[0].category).toContain("PC > Games");
      expect(results[0].category).toContain("4050");
    });

    it("should filter results by category correctly", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockSearchXml,
      });

      // Categories match
      const results1 = await newznabClient.search(mockIndexer, {
        query: "test",
        category: ["4050"],
      });
      expect(results1).toHaveLength(1);

      // Parent category match (if request is 4000, item category is 4050, then it matches)
      const results2 = await newznabClient.search(mockIndexer, {
        query: "test",
        category: ["4000"],
      });
      expect(results2).toHaveLength(1);

      // Categories don't match
      const results3 = await newznabClient.search(mockIndexer, {
        query: "test",
        category: ["5000"],
      });
      expect(results3).toHaveLength(0);
    });

    it("should handle error response", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });

      await expect(newznabClient.search(mockIndexer, { query: "test" })).rejects.toThrow(
        "HTTP 500: Server Error"
      );
    });
  });

  describe("getCategories", () => {
    it("should get categories successfully", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockCapsXml,
      });

      const categories = await newznabClient.getCategories(mockIndexer);

      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining("http://example.com/api?"),
        expect.any(Object)
      );
      expect(categories.length).toBe(5); // 1000, 1010, 1020, 4000, 4050
      expect(categories).toEqual(
        expect.arrayContaining([
          { id: "1000", name: "Console" },
          { id: "1010", name: "Console > NDS" },
          { id: "1020", name: "Console > PSP" },
          { id: "4000", name: "PC" },
        ])
      );
    });

    it("should append /api for saved Newznab root URLs", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockCapsXml,
      });

      await newznabClient.getCategories({ ...mockIndexer, url: "http://example.com" });

      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining("http://example.com/api?"),
        expect.any(Object)
      );
    });

    it("should try API-host root caps URLs when /api caps fails", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockCapsXml,
        });

      const categories = await newznabClient.getCategories({
        ...mockIndexer,
        url: "http://api.example.com/api",
      });

      expect(categories).toEqual(expect.arrayContaining([{ id: "4050", name: "PC > Games" }]));
      expect(safeFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("http://api.example.com/api?"),
        expect.any(Object)
      );
      expect(safeFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("http://api.example.com/?"),
        expect.any(Object)
      );
    });

    it("should try explicit XML caps output when default caps fails", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockCapsXml,
        });

      const categories = await newznabClient.getCategories(mockIndexer);

      expect(categories).toEqual(expect.arrayContaining([{ id: "1000", name: "Console" }]));
      expect(safeFetch).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("o=xml"),
        expect.any(Object)
      );
    });

    it("should parse JSON caps categories", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            caps: {
              categories: [
                {
                  id: "4000",
                  name: "PC",
                  subcat: [{ id: "4050", name: "Games" }],
                },
              ],
            },
          }),
      });

      const categories = await newznabClient.getCategories(mockIndexer);

      expect(categories).toEqual([
        { id: "4000", name: "PC" },
        { id: "4050", name: "PC > Games" },
      ]);
    });

    it("should return default game categories when caps has no categories", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => '<?xml version="1.0" encoding="UTF-8"?><caps><server /></caps>',
      });

      const categories = await newznabClient.getCategories(mockIndexer);

      expect(categories).toEqual(DEFAULT_NEWZNAB_GAME_CATEGORIES);
    });

    it("should return default game categories when caps fetch fails", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const categories = await newznabClient.getCategories(mockIndexer);

      expect(categories).toEqual(DEFAULT_NEWZNAB_GAME_CATEGORIES);
    });
  });

  describe("testConnection", () => {
    it("should return success for valid connection", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockCapsXml,
      });

      const result = await newznabClient.testConnection(mockIndexer);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Connection successful");
    });

    it("should test connection against fallback caps URLs", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockCapsXml,
        });

      const result = await newznabClient.testConnection({
        ...mockIndexer,
        url: "http://api.example.com/api",
      });

      expect(result.success).toBe(true);
      expect(safeFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle failed HTTP response", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await newznabClient.testConnection(mockIndexer);
      expect(result.success).toBe(false);
      expect(result.message).toContain("HTTP 401");
    });

    it("should handle error XML response", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () =>
          '<?xml version="1.0" encoding="UTF-8"?><error description="Invalid API Key" />',
      });

      const result = await newznabClient.testConnection(mockIndexer);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Invalid API Key");
    });
  });

  describe("searchMultipleIndexers", () => {
    it("should combine results", async () => {
      (isSafeUrl as Mock).mockResolvedValue(true);
      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockSearchXml,
      });

      // It searches in parallel
      const res = await newznabClient.searchMultipleIndexers(
        [mockIndexer, { ...mockIndexer, name: "Indexer2" }],
        { query: "test" }
      );

      // each indexer resolves 1 result
      // There's a problem with searchMultipleIndexers the way the client is written because the logic in searchMultipleIndexers looks a little strange but does concat items.
      expect(res.results.items.length).toBe(2);
    });

    it("should handle errors from one indexer gracefully", async () => {
      (isSafeUrl as Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      (safeFetch as Mock).mockResolvedValue({
        ok: true,
        text: async () => mockSearchXml,
      });

      const res = await newznabClient.searchMultipleIndexers(
        [mockIndexer, { ...mockIndexer, name: "Indexer2" }],
        { query: "test" }
      );
      expect(res.results.items.length).toBe(1);
      expect(res.errors.length).toBe(1);
    });
  });
});
