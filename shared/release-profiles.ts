import { categorizeDownload, type DownloadCategory } from "./download-categorizer.js";
import {
  cleanReleaseName,
  matchesPlatformFilter,
  normalizeTitle,
  parseReleaseMetadata,
  releaseMatchesGame,
} from "./title-utils.js";

export type ReleaseProtocolPreference = "torrent" | "usenet" | "either";
export type ReleaseTitleMatch = "exact" | "contains" | "fuzzy" | "none";

export interface CustomFormat {
  id: string;
  name: string;
  description: string;
  score: number;
  enabled: boolean;
}

export interface ReleaseProfile {
  id: string;
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
  preferredPlatform?: string | null;
}

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
    score: 100,
    enabled: true,
  },
  {
    id: "contains-title-match",
    name: "Contains game title",
    description: "The release title contains the requested game title as whole words.",
    score: 70,
    enabled: true,
  },
  {
    id: "newznab-games-category",
    name: "Games category",
    description: "The indexer returned a games category such as 4000 or a games subcategory.",
    score: 35,
    enabled: true,
  },
  {
    id: "pc-platform-signal",
    name: "PC or Windows marker",
    description: "The release title contains a PC, Windows, Win64, or x64 platform marker.",
    score: 25,
    enabled: true,
  },
  {
    id: "storefront-or-drmfree-marker",
    name: "Storefront or DRM-free marker",
    description: "The release title contains a recognized storefront or DRM-free marker.",
    score: 15,
    enabled: true,
  },
  {
    id: "main-edition-marker",
    name: "Main edition marker",
    description: "The release title contains edition wording commonly used for full game releases.",
    score: 10,
    enabled: true,
  },
  {
    id: "usenet-health",
    name: "Usenet health",
    description: "The NZB has grab or file-count signals from the indexer.",
    score: 10,
    enabled: true,
  },
  {
    id: "non-game-media",
    name: "Non-game media",
    description:
      "The title looks like music, video, books, comics, manuals, or other non-game media.",
    score: -120,
    enabled: true,
  },
  {
    id: "non-game-category",
    name: "Non-game category",
    description: "The indexer returned a category outside the games range.",
    score: -60,
    enabled: true,
  },
  {
    id: "wrong-platform",
    name: "Wrong platform",
    description: "The release platform does not match the preferred platform.",
    score: -80,
    enabled: true,
  },
];

const NON_GAME_MEDIA_PATTERN =
  /\b(soundtrack|ost|flac|mp3|aac|ebook|pdf|epub|comic|cbr|cbz|movie|film|s\d{1,2}e\d{1,2}|1080p|2160p|720p|bluray|b[dr]rip|web[ .-]?dl|hdtv|x264|x265|hevc|manual|guide|wallpaper|artbook|trainer|cheat)\b/i;
const PC_PLATFORM_PATTERN = /\b(pc|windows|win64|win32|x64|x86)\b/i;
const STOREFRONT_PATTERN = /\b(gog|steam|epic|drm[ ._-]?free)\b/i;
const MAIN_EDITION_PATTERN =
  /\b(complete|deluxe|ultimate|definitive|goty|gold|remastered|remake)\b/i;

function addScore(
  decision: Pick<ReleaseDecision, "matchedFormats"> & { score: number },
  customFormatId: string
) {
  const format = DEFAULT_CUSTOM_FORMATS.find((candidate) => candidate.id === customFormatId);
  if (!format?.enabled) return;
  decision.score += format.score;
  decision.matchedFormats.push(format.name);
}

function hasGameCategory(categories: string[]): boolean {
  return categories.some((category) => category === "4000" || category.startsWith("40"));
}

function hasOnlyNonGameCategories(categories: string[]): boolean {
  if (categories.length === 0) return false;
  return !hasGameCategory(categories);
}

function getTitleMatch(title: string, gameTitle: string): ReleaseTitleMatch {
  const normalizedGame = normalizeTitle(gameTitle);
  const normalizedTitle = normalizeTitle(title);
  const normalizedCleanTitle = normalizeTitle(cleanReleaseName(title));

  if (!normalizedGame || !normalizedTitle) return "none";
  if (normalizedTitle === normalizedGame || normalizedCleanTitle === normalizedGame) return "exact";

  const escapedGame = normalizedGame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const gameWordsRegex = new RegExp(`\\b${escapedGame}\\b`, "i");
  if (gameWordsRegex.test(normalizedTitle) || gameWordsRegex.test(normalizedCleanTitle)) {
    return "contains";
  }

  return releaseMatchesGame(title, gameTitle) ? "fuzzy" : "none";
}

function termIsPresent(title: string, term: string): boolean {
  return normalizeTitle(title).includes(normalizeTitle(term));
}

export function evaluateRelease(
  input: EvaluateReleaseInput,
  profile: ReleaseProfile = DEFAULT_RELEASE_PROFILE
): ReleaseDecision {
  const titleMatch = getTitleMatch(input.title, input.gameTitle);
  const metadata = parseReleaseMetadata(input.title);
  const { category: releaseCategory } = categorizeDownload(input.title);
  const categories = input.category ?? [];
  const profilePlatform = input.preferredPlatform ?? profile.preferredPlatform;
  const rejectionReasons: string[] = [];
  const decision = {
    score: 0,
    matchedFormats: [] as string[],
  };

  if (titleMatch === "exact") addScore(decision, "exact-title-match");
  else if (titleMatch === "contains") addScore(decision, "contains-title-match");
  else if (titleMatch === "fuzzy") decision.score += 35;
  else {
    decision.score -= 100;
    rejectionReasons.push("Release title does not match the game title");
  }

  if (hasGameCategory(categories)) addScore(decision, "newznab-games-category");
  if (hasOnlyNonGameCategories(categories)) {
    addScore(decision, "non-game-category");
    rejectionReasons.push("Indexer category is not a games category");
  }

  if (PC_PLATFORM_PATTERN.test(input.title)) addScore(decision, "pc-platform-signal");
  if (STOREFRONT_PATTERN.test(input.title)) addScore(decision, "storefront-or-drmfree-marker");
  if (MAIN_EDITION_PATTERN.test(input.title)) addScore(decision, "main-edition-marker");

  if (input.downloadType === "usenet" && ((input.grabs ?? 0) > 0 || (input.files ?? 0) > 0)) {
    addScore(decision, "usenet-health");
  }

  if (NON_GAME_MEDIA_PATTERN.test(input.title)) {
    addScore(decision, "non-game-media");
    rejectionReasons.push("Release looks like non-game media or extras");
  }

  if (profilePlatform && !matchesPlatformFilter(metadata.platform, profilePlatform)) {
    addScore(decision, "wrong-platform");
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
      reason === "Release looks like non-game media or extras" ||
      reason === "Indexer category is not a games category" ||
      reason.startsWith("Release platform does not match")
  );
  const accepted = titleMatch !== "none" && decision.score >= profile.minScore && !hardRejected;
  if (!accepted && decision.score < profile.minScore) {
    rejectionReasons.push(`Score ${decision.score} is below minimum ${profile.minScore}`);
  }

  return {
    accepted,
    score: decision.score,
    rejectionReasons: Array.from(new Set(rejectionReasons)),
    matchedFormats: decision.matchedFormats,
    normalizedTitle: normalizeTitle(cleanReleaseName(input.title)),
    releaseCategory,
    titleMatch,
  };
}
