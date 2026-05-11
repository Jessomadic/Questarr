import { categorizeDownload, type DownloadCategory } from "./download-categorizer.js";
import {
  cleanReleaseName,
  matchesPlatformFilter,
  normalizeTitle,
  parseReleaseMetadata,
  releaseMatchesGame,
} from "./title-utils.js";

export type ReleaseProtocolPreference = "torrent" | "usenet" | "either";
export type ReleaseTitleMatch = "exact" | "contains" | "fuzzy" | "mismatch" | "ambiguous-title";
export type IndexerCategoryClassification = "game" | "non-game" | "unknown";
export type CustomFormatConditionType =
  | "builtin"
  | "title"
  | "release_group"
  | "uploader"
  | "category"
  | "protocol";
export type CustomFormatMatcherMode = "builtin" | "contains" | "exact" | "regex";

export const DEFAULT_GAME_CATEGORY_IDS = [
  "1000",
  "1010",
  "1020",
  "1030",
  "1040",
  "1050",
  "1060",
  "1070",
  "1080",
  "1110",
  "1120",
  "1130",
  "1140",
  "1180",
  "4000",
  "4010",
  "4020",
  "4030",
  "4050",
];

export interface CustomFormat {
  id: string;
  userId?: string | null;
  name: string;
  description: string;
  conditionType: CustomFormatConditionType;
  matcherMode: CustomFormatMatcherMode;
  matcherValue: string;
  score: number;
  enabled: boolean;
  hardReject: boolean;
  builtIn: boolean;
}

export interface ReleaseProfile {
  id: string;
  userId?: string | null;
  name: string;
  minScore: number;
  preferredPlatform: string | null;
  protocolPreference: ReleaseProtocolPreference;
  requiredTerms: string[];
  ignoredTerms: string[];
  minSeeders: number;
  maxSize: number | null;
}

export interface ReleaseDecision {
  accepted: boolean;
  score: number;
  rejectionReasons: string[];
  matchedFormats: string[];
  normalizedTitle: string;
  releaseCategory: DownloadCategory;
  titleMatch: ReleaseTitleMatch;
}

export interface EvaluateReleaseInput {
  title: string;
  gameTitle: string;
  category?: string[];
  downloadType: "torrent" | "usenet";
  size?: number;
  seeders?: number;
  grabs?: number;
  files?: number;
  poster?: string;
  group?: string;
  uploader?: string;
  preferredPlatform?: string | null;
}

type ScoreAccumulator = Pick<ReleaseDecision, "matchedFormats"> & { score: number };

export const DEFAULT_RELEASE_PROFILE: ReleaseProfile = {
  id: "default",
  name: "Default Game Releases",
  minScore: 50,
  preferredPlatform: "PC",
  protocolPreference: "either",
  requiredTerms: [],
  ignoredTerms: [],
  minSeeders: 0,
  maxSize: null,
};

export const DEFAULT_CUSTOM_FORMATS: CustomFormat[] = [
  {
    id: "exact-title-match",
    name: "Exact game title",
    description: "The cleaned release title exactly matches the requested game title.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "exact-title-match",
    score: 100,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "contains-title-match",
    name: "Contains game title",
    description: "The release title contains the requested game title without sequel drift.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "contains-title-match",
    score: 70,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "fuzzy-title-match",
    name: "Fuzzy game title",
    description: "The release title loosely matches the requested game title.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "fuzzy-title-match",
    score: 35,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "newznab-games-category",
    name: "Games category",
    description: "The indexer returned a games category such as 4000 or a games subcategory.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "newznab-games-category",
    score: 35,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "pc-platform-signal",
    name: "PC or Windows marker",
    description: "The release title contains a PC, Windows, Win64, or x64 platform marker.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "pc-platform-signal",
    score: 25,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "storefront-or-drmfree-marker",
    name: "Storefront or DRM-free marker",
    description: "The release title contains a recognized storefront or DRM-free marker.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "storefront-or-drmfree-marker",
    score: 15,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "scene-release",
    name: "Scene release",
    description: "The release has a parsed release-group suffix that looks scene-style.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "scene-release",
    score: 20,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "p2p-release",
    name: "P2P release",
    description: "The release title or group contains common P2P markers.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "p2p-release",
    score: 8,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "repack-release",
    name: "Repack",
    description: "The release title includes a repack marker.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "repack-release",
    score: 8,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "update-release",
    name: "Update or patch",
    description: "The release title includes update, patch, or hotfix wording.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "update-release",
    score: 4,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "dlc-release",
    name: "DLC or expansion",
    description: "The release title includes DLC, expansion, or season pass wording.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "dlc-release",
    score: 4,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "crackfix-release",
    name: "Crackfix or hotfix",
    description: "The release title includes crackfix, hotfix, or fixed wording.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "crackfix-release",
    score: 3,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "usenet-health",
    name: "Usenet health",
    description: "The NZB has grab or file-count signals from the indexer.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "usenet-health",
    score: 10,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "usenet-poster-email",
    name: "Usenet poster email",
    description: "The NZB includes a poster or upload email signal from the indexer.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "usenet-poster-email",
    score: 6,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "usenet-games-newsgroup",
    name: "Games newsgroup",
    description: "The NZB was posted to a games-related Usenet group.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "usenet-games-newsgroup",
    score: 12,
    enabled: true,
    hardReject: false,
    builtIn: true,
  },
  {
    id: "non-game-media",
    name: "Non-game media",
    description:
      "The title looks like music, video, books, comics, manuals, trainers, or other non-game media.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "non-game-media",
    score: -120,
    enabled: true,
    hardReject: true,
    builtIn: true,
  },
  {
    id: "non-game-category",
    name: "Non-game category",
    description: "The indexer returned a category outside the games range.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "non-game-category",
    score: -60,
    enabled: true,
    hardReject: true,
    builtIn: true,
  },
  {
    id: "wrong-platform",
    name: "Wrong platform",
    description: "The release platform does not match the preferred platform.",
    conditionType: "builtin",
    matcherMode: "builtin",
    matcherValue: "wrong-platform",
    score: -80,
    enabled: true,
    hardReject: true,
    builtIn: true,
  },
];

const NON_GAME_MEDIA_PATTERN =
  /\b(soundtrack|ost|flac|mp3|aac|ebook|pdf|epub|comic|cbr|cbz|movie|film|s\d{1,2}e\d{1,2}|1080p|2160p|720p|bluray|b[dr]rip|web[ .-]?dl|hdtv|x264|x265|hevc|manual|guide|wallpaper|artbook|trainer|cheat)\b/i;
const PC_PLATFORM_PATTERN = /\b(pc|windows|win64|win32|x64|x86)\b/i;
const STOREFRONT_PATTERN = /\b(gog|steam|epic|drm[ ._-]?free)\b/i;
const P2P_PATTERN = /\b(p2p|portable|g4u)\b/i;
const REPACK_PATTERN = /\b(repack|repackaged|re-repack)\b/i;
const UPDATE_PATTERN = /\b(update|patch|hotfix)\b/i;
const DLC_PATTERN = /\b(dlc|expansion|season[ ._-]?pass|unlocker)\b/i;
const CRACKFIX_PATTERN = /\b(crackfix|hotfix|fixed|fix)\b/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const USENET_GAMES_GROUP_PATTERN =
  /\b(?:alt\.binaries\.(?:games|cd\.image|console|xbox|xbox360|wii|ps3|ps4|psp|nds|3ds|switch)(?:\.[a-z0-9-]+)*|a\.b\.(?:games|cd\.image|console)(?:\.[a-z0-9-]+)*)\b/i;
const METADATA_ONLY_TITLE_TOKENS = new Set([
  "edition",
  "complete",
  "deluxe",
  "ultimate",
  "definitive",
  "goty",
  "gold",
  "remastered",
  "remake",
  "pc",
  "windows",
  "win64",
  "win32",
  "x64",
  "x86",
  "gog",
  "steam",
  "epic",
  "drm",
  "free",
  "multi",
  "repack",
  "proper",
  "update",
  "patch",
  "hotfix",
]);

function getFormat(formats: CustomFormat[], customFormatId: string): CustomFormat | undefined {
  return formats.find(
    (candidate) =>
      candidate.enabled &&
      (candidate.id === customFormatId ||
        (candidate.conditionType === "builtin" && candidate.matcherValue === customFormatId))
  );
}

function addScore(
  decision: ScoreAccumulator,
  formats: CustomFormat[],
  customFormatId: string
): CustomFormat | undefined {
  const format = getFormat(formats, customFormatId);
  if (!format) return undefined;
  decision.score += format.score;
  decision.matchedFormats.push(format.name);
  return format;
}

const GAME_CATEGORY_LABEL_PATTERN = /\b(?:game|games)\b/i;
const NON_GAME_CATEGORY_LABEL_PATTERN =
  /\b(?:app|apps|application|applications|audio|book|books|ebook|ebooks|movie|movies|music|software|tv|manual|manuals|trainer|trainers|xxx|adult)\b/i;

function isNumericGameCategory(category: string): boolean {
  const trimmed = category.trim();
  return /^40\d{2}$/.test(trimmed) || /^1\d{3}$/.test(trimmed);
}

function isTextGameCategory(category: string): boolean {
  const normalized = normalizeTitle(category);
  return GAME_CATEGORY_LABEL_PATTERN.test(normalized);
}

function isKnownNonGameCategory(category: string): boolean {
  const normalized = normalizeTitle(category);
  return NON_GAME_CATEGORY_LABEL_PATTERN.test(normalized);
}

export function classifyIndexerCategories(categories: string[]): IndexerCategoryClassification {
  const usableCategories = categories.map((category) => category.trim()).filter(Boolean);
  if (usableCategories.length === 0) return "unknown";
  if (
    usableCategories.some(
      (category) => isNumericGameCategory(category) || isTextGameCategory(category)
    )
  ) {
    return "game";
  }
  if (usableCategories.some(isKnownNonGameCategory)) return "non-game";
  return "non-game";
}

export function categoriesMatchIndexerCategoryRequest(
  itemCategories: string[],
  requestedCategories: string[]
): boolean {
  if (itemCategories.length === 0) return true;

  return itemCategories.some((itemCategory) =>
    requestedCategories.some((requestedCategory) => {
      const item = itemCategory.trim();
      const requested = requestedCategory.trim();
      if (!item || !requested) return false;
      if (item === requested) return true;
      if (requested.endsWith("000") && item.startsWith(requested.substring(0, 1))) return true;
      return isNumericGameCategory(requested) && classifyIndexerCategories([item]) === "game";
    })
  );
}

function hasGameCategory(categories: string[]): boolean {
  return classifyIndexerCategories(categories) === "game";
}

function hasOnlyNonGameCategories(categories: string[]): boolean {
  return classifyIndexerCategories(categories) === "non-game";
}

function tokenSequenceIndex(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, offset) => haystack[i + offset] === token)) {
      return i;
    }
  }
  return -1;
}

function hasNumericToken(tokens: string[]): boolean {
  return tokens.some((token) => /^\d+$/.test(token));
}

/**
 * Classifies whether a release title is the requested game or a likely sequel/spin-off.
 * Base-title requests are strict: "Dishonored" will not accept "Dishonored 2" or
 * "Dishonored Death of the Outsider", while exact sequel/subtitle requests still pass.
 */
export function classifyReleaseTitleMatch(title: string, gameTitle: string): ReleaseTitleMatch {
  const normalizedGame = normalizeTitle(gameTitle);
  const normalizedTitle = normalizeTitle(title);
  const cleanedRelease = cleanReleaseName(title);
  const normalizedCleanTitle = normalizeTitle(cleanedRelease);

  if (!normalizedGame || !normalizedTitle) return "mismatch";
  if (normalizedTitle === normalizedGame || normalizedCleanTitle === normalizedGame) return "exact";

  const gameTokens = normalizedGame.split(" ").filter(Boolean);
  const releaseTokens = normalizedCleanTitle.split(" ").filter(Boolean);
  const sequenceIndex = tokenSequenceIndex(releaseTokens, gameTokens);

  if (sequenceIndex >= 0) {
    const extraTokens = [
      ...releaseTokens.slice(0, sequenceIndex),
      ...releaseTokens.slice(sequenceIndex + gameTokens.length),
    ].filter((token) => !METADATA_ONLY_TITLE_TOKENS.has(token));

    if (extraTokens.length === 0) return "contains";
    if (hasNumericToken(extraTokens)) return "ambiguous-title";
    if (!hasNumericToken(gameTokens)) return "ambiguous-title";
    return "contains";
  }

  return releaseMatchesGame(title, gameTitle) ? "fuzzy" : "mismatch";
}

function termIsPresent(title: string, term: string): boolean {
  return normalizeTitle(title).includes(normalizeTitle(term));
}

function textMatches(value: string | undefined, format: CustomFormat): boolean {
  if (!value || !format.matcherValue) return false;
  if (format.matcherMode === "regex") {
    try {
      return new RegExp(format.matcherValue, "i").test(value);
    } catch {
      return false;
    }
  }
  const normalizedValue = normalizeTitle(value);
  const normalizedMatcher = normalizeTitle(format.matcherValue);
  if (format.matcherMode === "exact") return normalizedValue === normalizedMatcher;
  return normalizedValue.includes(normalizedMatcher);
}

function categoryMatches(categories: string[], format: CustomFormat): boolean {
  return categories.some((category) => textMatches(category, format));
}

function customFormatMatches(
  format: CustomFormat,
  input: EvaluateReleaseInput,
  metadata: ReturnType<typeof parseReleaseMetadata>,
  categories: string[]
): boolean {
  if (!format.enabled || format.conditionType === "builtin") return false;
  if (format.conditionType === "title") return textMatches(input.title, format);
  if (format.conditionType === "release_group") {
    return textMatches(input.group, format) || textMatches(metadata.group, format);
  }
  if (format.conditionType === "uploader") {
    return (
      textMatches(input.uploader, format) ||
      textMatches(input.poster, format) ||
      textMatches(input.group, format)
    );
  }
  if (format.conditionType === "category") return categoryMatches(categories, format);
  if (format.conditionType === "protocol") return textMatches(input.downloadType, format);
  return false;
}

export function evaluateRelease(
  input: EvaluateReleaseInput,
  profile: ReleaseProfile = DEFAULT_RELEASE_PROFILE,
  customFormats: CustomFormat[] = DEFAULT_CUSTOM_FORMATS
): ReleaseDecision {
  const formats = customFormats.length > 0 ? customFormats : DEFAULT_CUSTOM_FORMATS;
  const titleMatch = classifyReleaseTitleMatch(input.title, input.gameTitle);
  const metadata = parseReleaseMetadata(input.title);
  const { category: releaseCategory } = categorizeDownload(input.title);
  const categories = input.category ?? [];
  const profilePlatform = input.preferredPlatform ?? profile.preferredPlatform;
  const rejectionReasons: string[] = [];
  const decision = {
    score: 0,
    matchedFormats: [] as string[],
  };

  if (titleMatch === "exact") addScore(decision, formats, "exact-title-match");
  else if (titleMatch === "contains") addScore(decision, formats, "contains-title-match");
  else if (titleMatch === "fuzzy") addScore(decision, formats, "fuzzy-title-match");
  else if (titleMatch === "ambiguous-title") {
    decision.score -= 100;
    rejectionReasons.push("Release appears to be a sequel or spin-off of the requested game");
  } else {
    decision.score -= 100;
    rejectionReasons.push("Release title does not match the game title");
  }

  if (hasGameCategory(categories)) addScore(decision, formats, "newznab-games-category");
  if (hasOnlyNonGameCategories(categories)) {
    addScore(decision, formats, "non-game-category");
    rejectionReasons.push("Indexer category is not a games category");
  }

  if (PC_PLATFORM_PATTERN.test(input.title)) addScore(decision, formats, "pc-platform-signal");
  if (STOREFRONT_PATTERN.test(input.title)) {
    addScore(decision, formats, "storefront-or-drmfree-marker");
  }
  if (metadata.isScene) addScore(decision, formats, "scene-release");
  if (P2P_PATTERN.test(input.title) || P2P_PATTERN.test(metadata.group ?? "")) {
    addScore(decision, formats, "p2p-release");
  }
  if (REPACK_PATTERN.test(input.title)) addScore(decision, formats, "repack-release");
  if (UPDATE_PATTERN.test(input.title)) addScore(decision, formats, "update-release");
  if (DLC_PATTERN.test(input.title)) addScore(decision, formats, "dlc-release");
  if (CRACKFIX_PATTERN.test(input.title)) addScore(decision, formats, "crackfix-release");

  if (input.downloadType === "usenet" && ((input.grabs ?? 0) > 0 || (input.files ?? 0) > 0)) {
    addScore(decision, formats, "usenet-health");
  }
  if (input.downloadType === "usenet" && EMAIL_PATTERN.test(input.poster ?? input.uploader ?? "")) {
    addScore(decision, formats, "usenet-poster-email");
  }
  if (input.downloadType === "usenet" && USENET_GAMES_GROUP_PATTERN.test(input.group ?? "")) {
    addScore(decision, formats, "usenet-games-newsgroup");
  }

  if (NON_GAME_MEDIA_PATTERN.test(input.title)) {
    addScore(decision, formats, "non-game-media");
    rejectionReasons.push("Release looks like non-game media or extras");
  }

  if (profilePlatform && !matchesPlatformFilter(metadata.platform, profilePlatform)) {
    addScore(decision, formats, "wrong-platform");
    rejectionReasons.push(`Release platform does not match ${profilePlatform}`);
  }

  if (
    profile.protocolPreference !== "either" &&
    input.downloadType !== profile.protocolPreference
  ) {
    decision.score -= 35;
    rejectionReasons.push(`Profile prefers ${profile.protocolPreference}`);
  }

  for (const term of profile.requiredTerms) {
    if (!termIsPresent(input.title, term)) {
      decision.score -= 50;
      rejectionReasons.push(`Missing required term: ${term}`);
    }
  }

  for (const term of profile.ignoredTerms) {
    if (termIsPresent(input.title, term)) {
      decision.score -= 80;
      rejectionReasons.push(`Contains ignored term: ${term}`);
    }
  }

  for (const format of formats) {
    if (!customFormatMatches(format, input, metadata, categories)) continue;
    decision.score += format.score;
    decision.matchedFormats.push(format.name);
    if (format.hardReject) {
      rejectionReasons.push(`Blocked by custom format: ${format.name}`);
    }
  }

  if (input.downloadType === "torrent" && (input.seeders ?? 0) < profile.minSeeders) {
    decision.score -= 40;
    rejectionReasons.push(`Seeders below minimum: ${profile.minSeeders}`);
  }

  if (profile.maxSize != null && input.size != null && input.size > profile.maxSize) {
    decision.score -= 40;
    rejectionReasons.push("Release is larger than profile maximum size");
  }

  if (releaseCategory === "extra") {
    decision.score -= 35;
    if (!rejectionReasons.includes("Release looks like non-game media or extras")) {
      rejectionReasons.push("Release is categorized as extras");
    }
  }

  const hardRejected = rejectionReasons.some(
    (reason) =>
      reason === "Release title does not match the game title" ||
      reason === "Release appears to be a sequel or spin-off of the requested game" ||
      reason === "Release looks like non-game media or extras" ||
      reason === "Indexer category is not a games category" ||
      reason.startsWith("Release platform does not match") ||
      reason.startsWith("Blocked by custom format:")
  );
  const accepted =
    titleMatch !== "mismatch" &&
    titleMatch !== "ambiguous-title" &&
    decision.score >= profile.minScore &&
    !hardRejected;
  if (!accepted && decision.score < profile.minScore) {
    rejectionReasons.push(`Score ${decision.score} is below minimum ${profile.minScore}`);
  }

  return {
    accepted,
    score: decision.score,
    rejectionReasons: Array.from(new Set(rejectionReasons)),
    matchedFormats: Array.from(new Set(decision.matchedFormats)),
    normalizedTitle: normalizeTitle(cleanReleaseName(input.title)),
    releaseCategory,
    titleMatch,
  };
}
