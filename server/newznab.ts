import { XMLParser } from "fast-xml-parser";
import { type Indexer } from "@shared/schema";
import { categoriesMatchIndexerCategoryRequest } from "../shared/release-profiles.js";
import { routesLogger } from "./logger.js";
import { isSafeUrl, safeFetch } from "./ssrf.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface NewznabSearchParams {
  query: string;
  category?: string[];
  limit?: number;
  offset?: number;
}

export interface NewznabResult {
  title: string;
  link: string; // NZB download URL
  size?: number;
  publishDate: string;
  indexerId: string;
  indexerName: string;
  category: string[];
  guid: string; // Unique identifier
  // Usenet-specific fields
  grabs?: number; // Number of downloads
  age?: number; // Age in days
  files?: number; // Number of files in NZB
  poster?: string; // Usenet poster
  group?: string; // Usenet newsgroup
}

export interface NewznabSearchResults {
  items: NewznabResult[];
  total: number;
  offset: number;
}

export interface NewznabCategory {
  id: string;
  name: string;
}

export const DEFAULT_NEWZNAB_GAME_CATEGORIES: NewznabCategory[] = [
  { id: "4000", name: "PC" },
  { id: "4050", name: "PC > Games" },
  { id: "1000", name: "Console" },
  { id: "1010", name: "Console > NDS" },
  { id: "1020", name: "Console > PSP" },
  { id: "1030", name: "Console > Wii" },
  { id: "1040", name: "Console > Xbox" },
  { id: "1050", name: "Console > Xbox 360" },
  { id: "1080", name: "Console > PlayStation 3" },
  { id: "1110", name: "Console > Nintendo 3DS" },
  { id: "1120", name: "Console > PlayStation Vita" },
  { id: "1130", name: "Console > Wii U" },
  { id: "1140", name: "Console > Xbox One" },
  { id: "1180", name: "Console > PlayStation 4" },
];

function buildNewznabApiUrl(indexer: Indexer, apiFunction: string): URL {
  const url = new URL(indexer.url);
  ensureNewznabApiPath(url);
  url.searchParams.set("apikey", indexer.apiKey);
  url.searchParams.set("t", apiFunction);
  return url;
}

function ensureNewznabApiPath(url: URL): void {
  const pathSegments = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (!pathSegments.includes("api")) {
    url.pathname = url.pathname.endsWith("/") ? `${url.pathname}api` : `${url.pathname}/api`;
  }
}

function removeNewznabApiPath(url: URL): void {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length > 0 && segments[segments.length - 1].toLowerCase() === "api") {
    segments.pop();
    url.pathname = segments.length > 0 ? `/${segments.join("/")}` : "/";
  }
}

function setNewznabCommonParams(
  url: URL,
  indexer: Indexer,
  apiFunction: string,
  includeApiKey: boolean,
  outputFormat?: "xml" | "json"
): void {
  if (includeApiKey) {
    url.searchParams.set("apikey", indexer.apiKey);
  } else {
    url.searchParams.delete("apikey");
  }
  url.searchParams.set("t", apiFunction);
  if (outputFormat) {
    url.searchParams.set("o", outputFormat);
  } else {
    url.searchParams.delete("o");
  }
}

function buildNewznabCapsUrlCandidates(indexer: Indexer): URL[] {
  const candidates: URL[] = [];
  const seen = new Set<string>();

  const addCandidate = (
    mutatePath: (url: URL) => void,
    includeApiKey: boolean,
    outputFormat?: "xml" | "json"
  ) => {
    const candidate = new URL(indexer.url);
    mutatePath(candidate);
    setNewznabCommonParams(candidate, indexer, "caps", includeApiKey, outputFormat);

    const key = candidate.toString();
    if (!seen.has(key)) {
      candidates.push(candidate);
      seen.add(key);
    }
  };

  addCandidate(ensureNewznabApiPath, true);
  addCandidate((url) => removeNewznabApiPath(url), true);
  addCandidate(ensureNewznabApiPath, true, "xml");
  addCandidate((url) => removeNewznabApiPath(url), true, "xml");
  addCandidate(ensureNewznabApiPath, false, "xml");
  addCandidate(ensureNewznabApiPath, true, "json");
  addCandidate((url) => removeNewznabApiPath(url), true, "json");

  return candidates;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getField(source: unknown, keys: string[]): unknown {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] != null) return record[key];
  }
  return undefined;
}

function parseNewznabCapsPayload(payload: string): unknown {
  const trimmed = payload.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  return parser.parse(payload);
}

function getNewznabCapsRoot(payload: string): unknown {
  const data = parseNewznabCapsPayload(payload);

  return (
    getField(data, ["caps"]) ?? getField(data, ["response"]) ?? getField(data, ["newznab"]) ?? data
  );
}

function getNewznabErrorDescription(root: unknown, payload?: string): string | null {
  const data = payload ? parseNewznabCapsPayload(payload) : undefined;
  const error = getField(root, ["error"]) ?? getField(data, ["error"]);

  if (error) {
    const description =
      getField(error, ["@_description", "description", "@description"]) ??
      getField(error, ["@_code", "code", "@code"]) ??
      "unknown error";
    return String(description);
  }

  return null;
}

function parseNewznabCapsCategories(payload: string): NewznabCategory[] {
  const data = parseNewznabCapsPayload(payload);
  const root =
    getField(data, ["caps"]) ?? getField(data, ["response"]) ?? getField(data, ["newznab"]) ?? data;
  const errorDescription = getNewznabErrorDescription(root);
  if (errorDescription) {
    throw new Error(`Newznab caps error: ${errorDescription}`);
  }

  const categoriesRoot = getField(root, ["categories"]) ?? getField(data, ["categories"]);
  const rawCategories = Array.isArray(categoriesRoot)
    ? categoriesRoot
    : asArray(getField(categoriesRoot, ["category"]));
  const categories: NewznabCategory[] = [];

  for (const cat of rawCategories) {
    const id = getField(cat, ["@_id", "id", "@id"]);
    const name = getField(cat, ["@_name", "name", "@name", "#text"]);
    if (id) {
      categories.push({
        id: String(id),
        name: name ? String(name) : `Category ${String(id)}`,
      });
    }

    const rawSubcategories = asArray(
      getField(cat, ["subcat"]) ??
        getField(getField(cat, ["subcategories"]), ["subcat"]) ??
        getField(getField(cat, ["categories"]), ["category"])
    );

    for (const subcat of rawSubcategories) {
      const subcatId = getField(subcat, ["@_id", "id", "@id"]);
      const subcatName = getField(subcat, ["@_name", "name", "@name", "#text"]);
      if (subcatId) {
        const parentName = name ? String(name) : `Category ${String(id)}`;
        const childName = subcatName ? String(subcatName) : `Category ${String(subcatId)}`;
        categories.push({
          id: String(subcatId),
          name: `${parentName} > ${childName}`,
        });
      }
    }
  }

  return categories;
}

class NewznabClient {
  /**
   * Search a single Newznab indexer
   */
  async search(indexer: Indexer, params: NewznabSearchParams): Promise<NewznabResult[]> {
    try {
      // Validate URL before making request
      if (!(await isSafeUrl(indexer.url))) {
        throw new Error(`Unsafe URL detected: ${indexer.url}`);
      }

      const url = buildNewznabApiUrl(indexer, "search");
      url.searchParams.set("q", params.query);

      if (params.category && params.category.length > 0) {
        url.searchParams.set("cat", params.category.join(","));
      } else {
        // Default to game categories
        const configuredCategories = indexer.categories || [];

        if (configuredCategories.length > 0) {
          // If categories are configured, use only the game-related ones
          // 40xx: PC Games, 10xx: Console Games
          const gameCategories = configuredCategories.filter(
            (cat) =>
              cat.startsWith("40") ||
              cat.startsWith("10") ||
              cat.toLowerCase().includes("game") ||
              cat.toLowerCase().includes("pc")
          );
          if (gameCategories.length > 0) {
            url.searchParams.set("cat", gameCategories.join(","));
          } else {
            // If configured categories exist but none match games, use them anyway
            // (user might know what they are doing, e.g. custom category ID)
            url.searchParams.set("cat", configuredCategories.join(","));
          }
        } else {
          // If NO categories are configured, default to standard Game categories
          // 4000: PC Games, 1000: Console Games
          url.searchParams.set("cat", "4000,1000");
        }
      }

      if (params.limit) {
        url.searchParams.set("limit", params.limit.toString());
      }

      if (params.offset) {
        url.searchParams.set("offset", params.offset.toString());
      }

      // Extended attributes for more metadata
      url.searchParams.set("extended", "1");

      routesLogger.info(
        { indexer: indexer.name, url: url.toString(), params },
        "searching newznab indexer"
      );

      const response = await safeFetch(url.toString(), {
        headers: {
          "User-Agent": "Questarr/1.0",
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      routesLogger.debug(
        { indexer: indexer.name, responseLength: xmlText.length },
        "received newznab response"
      );

      const data = parser.parse(xmlText);

      let results: NewznabResult[] = [];

      // Parse RSS feed structure
      if (data.rss?.channel?.item) {
        const items = Array.isArray(data.rss.channel.item)
          ? data.rss.channel.item
          : [data.rss.channel.item];

        for (const item of items) {
          // Extract Newznab attributes
          // fast-xml-parser returns a single element as an object, multiple as an array
          const attrsRaw = item["newznab:attr"];
          const attrsArray = Array.isArray(attrsRaw) ? attrsRaw : attrsRaw ? [attrsRaw] : [];
          const attrMap = new Map<string, string>();

          for (const attr of attrsArray) {
            if (attr["@_name"] && attr["@_value"]) {
              attrMap.set(attr["@_name"], attr["@_value"]);
            }
          }

          // Get size - try multiple sources
          const sizeBytes = attrMap.get("size") || item.enclosure?.["@_length"];
          const sizeBytesNum = sizeBytes ? parseInt(sizeBytes, 10) : NaN;
          const size = !isNaN(sizeBytesNum) ? sizeBytesNum : undefined;

          // Calculate age in days
          const pubDate = new Date(item.pubDate || Date.now());
          const age = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24));

          // Get categories
          const categories: string[] = [];
          if (item.category) {
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            categories.push(...cats.filter(Boolean).map(String));
          }
          for (const attr of attrsArray) {
            if (attr["@_name"] === "category" && attr["@_value"]) {
              categories.push(String(attr["@_value"]));
            }
          }
          const uniqueCategories = Array.from(
            new Set(categories.map((category) => category.trim()).filter(Boolean))
          );

          routesLogger.debug(
            { title: item.title, categories: uniqueCategories, indexer: indexer.name },
            "parsed newznab item category"
          );

          results.push({
            title: item.title,
            link: item.link || item.enclosure?.["@_url"],
            size,
            publishDate: item.pubDate,
            indexerId: indexer.id,
            indexerName: indexer.name,
            category: uniqueCategories,
            guid: item.guid?.["#text"] || item.guid,
            // Usenet-specific
            grabs: (() => {
              const val = attrMap.get("grabs");
              if (!val) return undefined;
              const num = parseInt(val, 10);
              return !isNaN(num) ? num : undefined;
            })(),
            age,
            files: (() => {
              const val = attrMap.get("files");
              if (!val) return undefined;
              const num = parseInt(val, 10);
              return !isNaN(num) ? num : undefined;
            })(),
            poster: attrMap.get("poster"),
            group: attrMap.get("group"),
          });
        }
      }

      routesLogger.info(
        { indexer: indexer.name, count: results.length },
        "newznab search results processed"
      );

      // Filter results by category if specific categories were requested
      if (params.category && params.category.length > 0) {
        const requestedCats = params.category;
        const initialCount = results.length;

        results = results.filter((item) => {
          // If item has no category info, we keep it (conservative approach)
          if (!item.category || item.category.length === 0) return true;

          return categoriesMatchIndexerCategoryRequest(item.category, requestedCats);
        });

        if (results.length < initialCount) {
          routesLogger.info(
            {
              indexer: indexer.name,
              filtered: initialCount - results.length,
              remaining: results.length,
            },
            "filtered newznab results by category"
          );
        }
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = {
        indexer: indexer.name,
        indexerUrl: indexer.url,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
      };
      routesLogger.error(errorDetails, "newznab search error");
      throw new Error(`Newznab search failed for ${indexer.name}: ${errorMessage}`);
    }
  }

  /**
   * Search multiple Newznab indexers in parallel
   */
  async searchMultipleIndexers(
    indexers: Indexer[],
    params: NewznabSearchParams
  ): Promise<{ results: NewznabSearchResults; errors: Array<{ indexer: string; error: string }> }> {
    const promises = indexers.map((indexer) =>
      this.search(indexer, params)
        .then((results) => ({ indexer: indexer.name, results, error: null }))
        .catch((error) => ({ indexer: indexer.name, results: [], error: error.message }))
    );

    const settled = await Promise.all(promises);

    const allResults: NewznabResult[] = [];
    const errors: Array<{ indexer: string; error: string }> = [];

    for (const result of settled) {
      if (result.error) {
        errors.push({ indexer: result.indexer, error: result.error });
      } else {
        allResults.push(...result.results);
      }
    }

    // Sort by publish date (newest first)
    allResults.sort((a, b) => {
      const dateA = new Date(a.publishDate).getTime();
      const dateB = new Date(b.publishDate).getTime();
      return dateB - dateA;
    });

    return {
      results: {
        items: allResults.slice(params.offset || 0, (params.offset || 0) + (params.limit || 50)),
        total: allResults.length,
        offset: params.offset || 0,
      },
      errors,
    };
  }

  /**
   * Get available categories from a Newznab indexer
   */
  async getCategories(indexer: Indexer): Promise<NewznabCategory[]> {
    try {
      if (!(await isSafeUrl(indexer.url))) {
        throw new Error(`Unsafe URL detected: ${indexer.url}`);
      }

      let lastError: unknown;

      for (const url of buildNewznabCapsUrlCandidates(indexer)) {
        try {
          const response = await safeFetch(url.toString(), {
            headers: {
              Accept: "application/xml,text/xml,application/json,*/*",
              "User-Agent": "Questarr/1.0",
            },
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const payload = await response.text();
          const categories = parseNewznabCapsCategories(payload);

          if (categories.length > 0) {
            return categories;
          }

          lastError = new Error("caps response did not include categories");
        } catch (error) {
          lastError = error;
          routesLogger.debug(
            { indexer: indexer.name, url: url.toString(), error },
            "newznab caps category candidate failed"
          );
        }
      }

      routesLogger.warn(
        { indexer: indexer.name, error: lastError },
        "newznab caps returned no categories; using default game categories"
      );
      return DEFAULT_NEWZNAB_GAME_CATEGORIES;
    } catch (error) {
      routesLogger.warn(
        { indexer: indexer.name, error },
        "failed to get newznab categories; using default game categories"
      );
      return DEFAULT_NEWZNAB_GAME_CATEGORIES;
    }
  }

  /**
   * Test connection to a Newznab indexer
   */
  async testConnection(indexer: Indexer): Promise<{ success: boolean; message: string }> {
    try {
      if (!(await isSafeUrl(indexer.url))) {
        return { success: false, message: "Unsafe URL detected" };
      }

      let lastErrorMessage = "Invalid Newznab response";

      for (const url of buildNewznabCapsUrlCandidates(indexer)) {
        try {
          const response = await safeFetch(url.toString(), {
            headers: {
              Accept: "application/xml,text/xml,application/json,*/*",
              "User-Agent": "Questarr/1.0",
            },
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) {
            lastErrorMessage = `Connection failed: HTTP ${response.status}`;
            continue;
          }

          const payload = await response.text();
          const root = getNewznabCapsRoot(payload);
          const errorDescription = getNewznabErrorDescription(root);

          if (errorDescription) {
            return {
              success: false,
              message: errorDescription,
            };
          }

          if (
            getField(root, ["server"]) ||
            getField(root, ["categories"]) ||
            getField(root, ["limits"])
          ) {
            return {
              success: true,
              message: "Connection successful",
            };
          }

          lastErrorMessage = "Invalid Newznab response";
        } catch (error) {
          lastErrorMessage = error instanceof Error ? error.message : "Unknown error";
        }
      }

      return {
        success: false,
        message: lastErrorMessage,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export const newznabClient = new NewznabClient();
