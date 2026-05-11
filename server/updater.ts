import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import semver from "semver";

const DEFAULT_UPDATE_REPO = "Jessomadic/Questarr";
const INSTALLER_ASSET_PATTERN = /^QuestarrSetup-[\w.-]+-windows-x64\.exe$/i;
const GITHUB_API_VERSION = "2022-11-28";

export type UpdateChannel = "stable" | "prerelease";

export interface UpdateAsset {
  name: string;
  size: number;
  browserDownloadUrl: string;
}

export interface UpdateRelease {
  tagName: string;
  version: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
  publishedAt: string | null;
  htmlUrl: string;
  body: string;
  asset: UpdateAsset | null;
}

export interface UpdateCheckResult {
  currentVersion: string;
  currentTag: string;
  repo: string;
  channel: UpdateChannel;
  supported: boolean;
  updateAvailable: boolean;
  release: UpdateRelease | null;
  downloadedInstallerPath: string | null;
  reason?: string;
}

export interface UpdateDownloadResult {
  downloaded: true;
  installerPath: string;
  fileName: string;
  sizeBytes: number;
  release: UpdateRelease;
}

export interface UpdateInstallResult {
  started: true;
  installerPath: string;
  command: string;
  args: string[];
  message: string;
}

interface GitHubReleaseAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  prerelease?: boolean;
  draft?: boolean;
  published_at?: string | null;
  html_url?: string;
  body?: string;
  assets?: GitHubReleaseAsset[];
}

interface UpdateRequest {
  channel?: UpdateChannel;
  tagName?: string;
}

function getRepo(): string {
  return process.env.QUESTARR_UPDATE_REPO?.trim() || DEFAULT_UPDATE_REPO;
}

function getDataDir(): string {
  return process.env.QUESTARR_DATA_DIR || path.join(process.cwd(), "data");
}

function getUpdateDir(): string {
  return path.join(getDataDir(), "updates");
}

async function getCurrentVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(raw) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function normalizeVersion(tagName: string): string {
  return tagName.replace(/^v/i, "");
}

function isNewerVersion(candidate: string, current: string): boolean {
  const validCandidate = semver.valid(candidate);
  const validCurrent = semver.valid(current);
  if (validCandidate && validCurrent) {
    return semver.gt(validCandidate, validCurrent);
  }

  return candidate !== current;
}

function assertUpdateChannel(channel: unknown): UpdateChannel {
  if (channel === "prerelease") {
    return "prerelease";
  }

  return "stable";
}

function toRelease(release: GitHubRelease): UpdateRelease | null {
  const tagName = release.tag_name;
  if (!tagName) {
    return null;
  }

  const asset =
    release.assets?.find((candidate) => {
      const name = candidate.name ?? "";
      return INSTALLER_ASSET_PATTERN.test(name) && !!candidate.browser_download_url;
    }) ?? null;

  return {
    tagName,
    version: normalizeVersion(tagName),
    name: release.name || tagName,
    prerelease: release.prerelease === true,
    draft: release.draft === true,
    publishedAt: release.published_at ?? null,
    htmlUrl: release.html_url || `https://github.com/${getRepo()}/releases/tag/${tagName}`,
    body: release.body || "",
    asset: asset
      ? {
          name: asset.name ?? "",
          size: asset.size ?? 0,
          browserDownloadUrl: asset.browser_download_url ?? "",
        }
      : null,
  };
}

async function fetchGitHubReleases(): Promise<UpdateRelease[]> {
  const repo = getRepo();
  const currentVersion = await getCurrentVersion();
  const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": `Questarr/${currentVersion}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed with ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GitHubRelease[];
  return data
    .map(toRelease)
    .filter((release): release is UpdateRelease => release !== null)
    .filter((release) => !release.draft);
}

async function findDownloadedInstaller(fileName: string | null): Promise<string | null> {
  if (!fileName || !INSTALLER_ASSET_PATTERN.test(fileName)) {
    return null;
  }

  const installerPath = path.join(getUpdateDir(), fileName);
  try {
    await fs.access(installerPath);
    return installerPath;
  } catch {
    return null;
  }
}

function selectRelease(
  releases: UpdateRelease[],
  channel: UpdateChannel,
  tagName?: string
): UpdateRelease | null {
  if (tagName) {
    return (
      releases.find((release) => release.tagName === tagName || release.version === tagName) ?? null
    );
  }

  return (
    releases.find((release) => {
      if (!release.asset) {
        return false;
      }

      if (channel === "stable") {
        return !release.prerelease;
      }

      return true;
    }) ?? null
  );
}

export function getSilentInstallerArgs(): string[] {
  return [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/SP-",
    "/CLOSEAPPLICATIONS",
    "/RESTARTAPPLICATIONS",
  ];
}

export async function checkForUpdate(request: UpdateRequest = {}): Promise<UpdateCheckResult> {
  const channel = assertUpdateChannel(request.channel);
  const currentVersion = await getCurrentVersion();
  const releases = await fetchGitHubReleases();
  const release = selectRelease(releases, channel, request.tagName);
  const downloadedInstallerPath = await findDownloadedInstaller(release?.asset?.name ?? null);
  const supported = process.platform === "win32";

  return {
    currentVersion,
    currentTag: `v${currentVersion}`,
    repo: getRepo(),
    channel,
    supported,
    updateAvailable: release ? isNewerVersion(release.version, currentVersion) : false,
    release,
    downloadedInstallerPath,
    reason: supported
      ? undefined
      : "Silent updates are only supported by the Windows installer build.",
  };
}

export async function downloadUpdate(request: UpdateRequest = {}): Promise<UpdateDownloadResult> {
  const channel = assertUpdateChannel(request.channel);
  const releases = await fetchGitHubReleases();
  const release = selectRelease(releases, channel, request.tagName);
  if (!release) {
    throw new Error("No matching Questarr release was found.");
  }

  if (!release.asset) {
    throw new Error("The selected release does not include a Windows installer asset.");
  }

  const fileName = path.basename(release.asset.name);
  if (!INSTALLER_ASSET_PATTERN.test(fileName)) {
    throw new Error("The selected release asset is not a Questarr Windows installer.");
  }

  const response = await fetch(release.asset.browserDownloadUrl, {
    headers: {
      "User-Agent": `Questarr/${await getCurrentVersion()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Installer download failed with ${response.status} ${response.statusText}`);
  }

  const updateDir = getUpdateDir();
  await fs.mkdir(updateDir, { recursive: true });
  const installerPath = path.join(updateDir, fileName);
  const tempPath = `${installerPath}.tmp`;
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, installerPath);
  await fs.writeFile(
    path.join(updateDir, "latest.json"),
    JSON.stringify(
      {
        repo: getRepo(),
        tagName: release.tagName,
        version: release.version,
        prerelease: release.prerelease,
        installerPath,
        downloadedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return {
    downloaded: true,
    installerPath,
    fileName,
    sizeBytes: buffer.byteLength,
    release,
  };
}

async function resolveInstallerForInstall(
  request: UpdateRequest = {}
): Promise<UpdateDownloadResult> {
  const check = await checkForUpdate(request);
  const installerPath = check.downloadedInstallerPath;
  if (check.release?.asset && installerPath) {
    const stats = await fs.stat(installerPath);
    return {
      downloaded: true,
      installerPath,
      fileName: check.release.asset.name,
      sizeBytes: stats.size,
      release: check.release,
    };
  }

  return downloadUpdate(request);
}

export async function installUpdate(request: UpdateRequest = {}): Promise<UpdateInstallResult> {
  if (process.platform !== "win32") {
    throw new Error("Silent updates are only supported on Windows installer builds.");
  }

  const download = await resolveInstallerForInstall(request);
  const resolvedInstallerPath = path.resolve(download.installerPath);
  const resolvedUpdateDir = path.resolve(getUpdateDir());
  if (!resolvedInstallerPath.startsWith(resolvedUpdateDir + path.sep)) {
    throw new Error("Refusing to run an installer outside the Questarr updates directory.");
  }

  const args = getSilentInstallerArgs();
  const child = spawn(resolvedInstallerPath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  return {
    started: true,
    installerPath: resolvedInstallerPath,
    command: resolvedInstallerPath,
    args,
    message:
      "Questarr started the silent installer. The service will stop during upgrade and restart when setup completes.",
  };
}
