import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  downloadUpdate,
  getSilentInstallerArgs,
  type UpdateRelease,
} from "../updater.js";

function githubRelease(
  tagName: string,
  options: { prerelease?: boolean; assetName?: string } = {}
): unknown {
  const assetName =
    options.assetName ?? `QuestarrSetup-${tagName.replace(/^v/, "")}-windows-x64.exe`;
  return {
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: options.prerelease ?? false,
    published_at: "2026-05-10T12:00:00Z",
    html_url: `https://github.com/Jessomadic/Questarr/releases/tag/${tagName}`,
    body: "Release notes",
    assets: assetName
      ? [
          {
            name: assetName,
            size: 1234,
            browser_download_url: `https://github.com/Jessomadic/Questarr/releases/download/${tagName}/${assetName}`,
          },
        ]
      : [],
  };
}

function mockJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => data,
  } as Response;
}

function mockBinaryResponse(data: string): Response {
  const bytes = new TextEncoder().encode(data);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () => bytes.buffer,
  } as Response;
}

describe("updater", () => {
  const originalFetch = global.fetch;
  const originalDataDir = process.env.QUESTARR_DATA_DIR;
  const originalRepo = process.env.QUESTARR_UPDATE_REPO;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "questarr-updater-"));
    process.env.QUESTARR_DATA_DIR = tempDir;
    process.env.QUESTARR_UPDATE_REPO = "Jessomadic/Questarr";
    vi.resetAllMocks();
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    process.env.QUESTARR_DATA_DIR = originalDataDir;
    process.env.QUESTARR_UPDATE_REPO = originalRepo;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("selects the latest live release for the stable channel", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse([
          githubRelease("v1.4.0-beta.1", { prerelease: true }),
          githubRelease("v1.3.1"),
        ])
      );

    const result = await checkForUpdate({ channel: "stable" });

    expect(result.repo).toBe("Jessomadic/Questarr");
    expect(result.release?.tagName).toBe("v1.3.1");
    expect(result.release?.prerelease).toBe(false);
    expect(result.updateAvailable).toBe(true);
  });

  it("allows the prerelease channel to select pre-release installers", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse([
          githubRelease("v1.4.0-beta.1", { prerelease: true }),
          githubRelease("v1.3.1"),
        ])
      );

    const result = await checkForUpdate({ channel: "prerelease" });

    expect(result.release?.tagName).toBe("v1.4.0-beta.1");
    expect(result.release?.prerelease).toBe(true);
  });

  it("skips releases without a Questarr Windows installer asset", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse([
          githubRelease("v1.3.2", { assetName: "questarr-linux.tar.gz" }),
          githubRelease("v1.3.1"),
        ])
      );

    const result = await checkForUpdate({ channel: "stable" });

    expect(result.release?.tagName).toBe("v1.3.1");
    expect((result.release as UpdateRelease).asset?.name).toBe(
      "QuestarrSetup-1.3.1-windows-x64.exe"
    );
  });

  it("downloads the selected installer into the data updates directory", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse([githubRelease("v1.3.1")]))
      .mockResolvedValueOnce(mockBinaryResponse("installer-bytes"));

    const result = await downloadUpdate({ channel: "stable" });

    expect(result.fileName).toBe("QuestarrSetup-1.3.1-windows-x64.exe");
    expect(result.installerPath).toBe(
      path.join(tempDir, "updates", "QuestarrSetup-1.3.1-windows-x64.exe")
    );
    await expect(fs.access(result.installerPath)).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, "updates", "latest.json"))).resolves.toBeUndefined();
  });

  it("uses silent Inno Setup flags for the installer", () => {
    expect(getSilentInstallerArgs()).toEqual(
      expect.arrayContaining(["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"])
    );
  });
});
