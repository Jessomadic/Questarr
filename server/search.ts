import { storage } from "./storage.js";
import { torznabClient } from "./torznab.js";
import { newznabClient } from "./newznab.js";
import { searchLogger } from "./logger.js";
import {
  buildSearchQueriesForTitle,
  normalizeTitle,
  parseReleaseMetadata,
} from "../shared/title-utils.js";
import {
  DEFAULT_RELEASE_PROFILE,
  DEFAULT_CUSTOM_FORMATS,
  evaluateRelease,
  type CustomFormat,
  type ReleaseDecision,
  type ReleaseProfile,
} from "../shared/release-profiles.js";
import type { Indexer } from "../shared/schema.js";

export interface SearchItem {
  title: string;
  link: string;
  pubDate: string;
  size?: number;
  indexerId: string;
  indexerName: string;
  indexerUrl?: string;
  category: string[];
  guid: string;
  downloadType: "torrent" | "usenet";
  // Protocol-specific fields
  seeders?: number;
  leechers?: number;
  downloadVolumeFactor?: number;
  uploadVolumeFactor?: number;
  grabs?: number;
  age?: number;
  files?: number;
  poster?: string;
  uploader?: string;
  group?: string;
  comments?: string;
  releaseDecision?: ReleaseDecision;
}

export interface SearchAttemptDiagnostic {
  indexerName: string;
  protocol: "torrent" | "usenet";
  query: string;
  categories: string[] | null;
  rawCount: number;
  keptCount: number;
  error?: string;
}

export interface SearchDiagnostics {
  attempts: SearchAttemptDiagnostic[];
  totalBeforeBlacklist?: number;
  blacklistedCount?: number;
}

export interface AggregatedSearchOptions {
  query: string;
  gameTitle?: string;
  category?: string[];
  categoryWasExplicit?: boolean;
  limit?: number;
  offset?: number;
  releaseProfile?: ReleaseProfile;
  customFormats?: CustomFormat[];
}

export interface AggregatedSearchResults {
  items: SearchItem[];
  total: number;
  offset: number;
  errors: string[];
  diagnostics: SearchDiagnostics;
}

interface TorznabSearchItem {
  title: string;
  link: string;
  pubDate: string;
  size?: number;
  indexerId?: string;
  indexerName?: string;
  indexerUrl?: string;
  category?: string;
  guid?: string;
  seeders?: number;
  leechers?: number;
  downloadVolumeFactor?: number;
  uploadVolumeFactor?: number;
  comments?: string;
  poster?: string;
  uploader?: string;
  group?: string;
}

interface NewznabSearchItem {
  title: string;
  link: string;
  publishDate: string;
  size?: number;
  indexerId: string;
  indexerName: string;
  category: string[];
  guid: string;
  grabs?: number;
  age?: number;
  files?: number;
  poster?: string;
  uploader?: string;
  group?: string;
}

function searchItemSort(a: SearchItem, b: SearchItem): number {
  const acceptedDelta =
    Number(b.releaseDecision?.accepted ?? false) - Number(a.releaseDecision?.accepted ?? false);
  if (acceptedDelta !== 0) return acceptedDelta;

  const scoreDelta = (b.releaseDecision?.score ?? 0) - (a.releaseDecision?.score ?? 0);
  if (scoreDelta !== 0) return scoreDelta;

  const healthA = a.downloadType === "usenet" ? (a.grabs ?? 0) : (a.seeders ?? 0);
  const healthB = b.downloadType === "usenet" ? (b.grabs ?? 0) : (b.seeders ?? 0);
  if (healthB !== healthA) return healthB - healthA;

  const dateA = new Date(a.pubDate).getTime();
  const dateB = new Date(b.pubDate).getTime();
  return dateB - dateA;
}

function mapTorznabItem(item: TorznabSearchItem): SearchItem {
  let comments = item.comments;
  if (!comments && item.indexerUrl && item.guid) {
    try {
      const baseUrl = new URL(item.indexerUrl);
      const guid = item.guid.split("/").pop() || item.guid;
      comments = `${baseUrl.protocol}//${baseUrl.host}/details/${guid}`;
    } catch (error) {
      searchLogger.warn(
        { error, indexerUrl: item.indexerUrl, guid: item.guid },
        "Failed to construct comments URL from indexer URL and GUID"
      );
    }
  }

  return {
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    size: item.size,
    indexerId: item.indexerId || "unknown",
    indexerName: item.indexerName || "unknown",
    indexerUrl: item.indexerUrl,
    category: item.category ? item.category.split(",").map((category) => category.trim()) : [],
    guid: item.guid || item.link,
    downloadType: "torrent",
    seeders: item.seeders,
    leechers: item.leechers,
    downloadVolumeFactor: item.downloadVolumeFactor,
    uploadVolumeFactor: item.uploadVolumeFactor,
    poster: item.poster,
    uploader: item.uploader,
    group: item.group || parseReleaseMetadata(item.title).group,
    comments,
  };
}

function mapNewznabItem(item: NewznabSearchItem): SearchItem {
  return {
    title: item.title,
    link: item.link,
    pubDate: item.publishDate,
    size: item.size,
    indexerId: item.indexerId,
    indexerName: item.indexerName,
    category: item.category,
    guid: item.guid,
    downloadType: "usenet",
    grabs: item.grabs,
    age: item.age,
    files: item.files,
    poster: item.poster,
    uploader: item.uploader,
    group: item.group,
  };
}

function dedupeKey(item: SearchItem): string {
  if (item.guid) return `guid:${item.guid}`;
  if (item.link) return `link:${item.link}`;
  return `title:${item.indexerName}:${normalizeTitle(item.title)}`;
}

function dedupeSearchItems(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const deduped: SearchItem[] = [];
  for (const item of items) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function attemptCategoriesLabel(
  indexer: Indexer,
  category: string[] | undefined,
  disableCategoryFilter: boolean
): string[] | null {
  if (disableCategoryFilter) return null;
  if (category && category.length > 0) return category;
  return indexer.categories?.length ? indexer.categories : ["default-games"];
}

async function runTorznabAttempt(
  indexer: Indexer,
  query: string,
  category: string[] | undefined,
  disableCategoryFilter: boolean,
  limit: number
): Promise<{ items: SearchItem[]; errors: string[]; diagnostic: SearchAttemptDiagnostic }> {
  const response = await torznabClient.searchMultipleIndexers([indexer], {
    query,
    category,
    disableCategoryFilter,
    limit,
    offset: 0,
  });
  const items = response.results.items.map((item) => mapTorznabItem(item as TorznabSearchItem));
  const error = response.errors?.join("; ") || undefined;
  return {
    items,
    errors: response.errors ?? [],
    diagnostic: {
      indexerName: indexer.name,
      protocol: "torrent",
      query,
      categories: attemptCategoriesLabel(indexer, category, disableCategoryFilter),
      rawCount: response.results.total ?? response.results.items.length,
      keptCount: items.length,
      ...(error ? { error } : {}),
    },
  };
}

async function runNewznabAttempt(
  indexer: Indexer,
  query: string,
  category: string[] | undefined,
  disableCategoryFilter: boolean,
  limit: number
): Promise<{ items: SearchItem[]; errors: string[]; diagnostic: SearchAttemptDiagnostic }> {
  const response = await newznabClient.searchMultipleIndexers([indexer], {
    query,
    category,
    disableCategoryFilter,
    limit,
    offset: 0,
  });
  const items = response.results.items.map((item) => mapNewznabItem(item as NewznabSearchItem));
  const errors = response.errors?.map((error) => `${error.indexer}: ${error.error}`) ?? [];
  const error = errors.join("; ") || undefined;
  return {
    items,
    errors,
    diagnostic: {
      indexerName: indexer.name,
      protocol: "usenet",
      query,
      categories: attemptCategoriesLabel(indexer, category, disableCategoryFilter),
      rawCount: response.results.total ?? response.results.items.length,
      keptCount: items.length,
      ...(error ? { error } : {}),
    },
  };
}

async function searchIndexerWithFallbacks(
  indexer: Indexer,
  options: AggregatedSearchOptions,
  attemptLimit: number
): Promise<{ items: SearchItem[]; errors: string[]; diagnostics: SearchAttemptDiagnostic[] }> {
  const queryAttempts = buildSearchQueriesForTitle(options.query);
  const categoryWasExplicit = options.categoryWasExplicit ?? options.category !== undefined;
  const allDiagnostics: SearchAttemptDiagnostic[] = [];
  const allErrors: string[] = [];

  for (const query of queryAttempts) {
    const runAttempt = indexer.protocol === "newznab" ? runNewznabAttempt : runTorznabAttempt;
    const scoped = await runAttempt(indexer, query, options.category, false, attemptLimit);
    allDiagnostics.push(scoped.diagnostic);
    allErrors.push(...scoped.errors);
    if (scoped.items.length > 0) {
      return { items: scoped.items, errors: allErrors, diagnostics: allDiagnostics };
    }
    if (scoped.errors.length > 0) {
      return { items: [], errors: allErrors, diagnostics: allDiagnostics };
    }

    if (!categoryWasExplicit) {
      const broad = await runAttempt(indexer, query, undefined, true, attemptLimit);
      allDiagnostics.push(broad.diagnostic);
      allErrors.push(...broad.errors);
      if (broad.items.length > 0) {
        return { items: broad.items, errors: allErrors, diagnostics: allDiagnostics };
      }
      if (broad.errors.length > 0) {
        return { items: [], errors: allErrors, diagnostics: allDiagnostics };
      }
    }
  }

  return { items: [], errors: allErrors, diagnostics: allDiagnostics };
}

export async function searchAllIndexers(
  options: AggregatedSearchOptions
): Promise<AggregatedSearchResults> {
  const enabledIndexers = await storage.getEnabledIndexers();
  const offset = options.offset || 0;
  const limit = options.limit || 50;
  const attemptLimit = Math.min(100, offset + limit);

  if (enabledIndexers.length === 0) {
    return {
      items: [],
      total: 0,
      offset,
      errors: ["No indexers configured"],
      diagnostics: { attempts: [] },
    };
  }

  const results = await Promise.all(
    enabledIndexers.map((indexer) => searchIndexerWithFallbacks(indexer, options, attemptLimit))
  );

  const combinedItems = dedupeSearchItems(results.flatMap((result) => result.items));
  const combinedErrors = Array.from(new Set(results.flatMap((result) => result.errors)));
  const diagnostics = results.flatMap((result) => result.diagnostics);

  for (const item of combinedItems) {
    item.releaseDecision = evaluateRelease(
      {
        title: item.title,
        gameTitle: options.gameTitle ?? options.query,
        category: item.category,
        downloadType: item.downloadType,
        size: item.size,
        seeders: item.seeders,
        grabs: item.grabs,
        files: item.files,
        poster: item.poster,
        uploader: item.uploader,
        group: item.group,
        preferredPlatform:
          options.releaseProfile?.preferredPlatform ?? DEFAULT_RELEASE_PROFILE.preferredPlatform,
      },
      options.releaseProfile ?? DEFAULT_RELEASE_PROFILE,
      options.customFormats ?? DEFAULT_CUSTOM_FORMATS
    );
  }

  combinedItems.sort(searchItemSort);

  return {
    items: combinedItems.slice(offset, offset + limit),
    total: combinedItems.length,
    offset,
    errors: combinedErrors,
    diagnostics: { attempts: diagnostics },
  };
}

/**
 * Filters search items by removing any whose title appears in the blacklist set.
 */
export function filterBlacklistedReleases(
  items: SearchItem[],
  blacklisted: Set<string>
): SearchItem[] {
  return blacklisted.size > 0 ? items.filter((item) => !blacklisted.has(item.title)) : items;
}
