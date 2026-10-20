/**
 * Lightweight update check against GitHub Releases.
 *
 * The app is not code-signed, so Squirrel-style in-place updates are not an
 * option on macOS; instead "Check for Updates…" (and a quiet daily check)
 * compares the running version with the latest release tag and points the
 * user at the download. Pure helpers here; main.mjs owns the dialog.
 */

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Parse "v1.13.0" / "1.13.0-rc.1" into comparable parts.
 * @param {string} version
 * @returns {{ parts: number[], prerelease: string | null } | null}
 */
export function parseVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(
    String(version ?? "").trim(),
  );
  if (!m) return null;
  return {
    parts: [Number(m[1]), Number(m[2]), Number(m[3])],
    prerelease: m[4] ?? null,
  };
}

/**
 * True when `candidate` is strictly newer than `current`. A pre-release is
 * older than the same numeric version without one.
 * @param {string} candidate
 * @param {string} current
 */
export function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) return a.parts[i] > b.parts[i];
  }
  if (a.prerelease === b.prerelease) return false;
  if (a.prerelease === null) return true;
  if (b.prerelease === null) return false;
  return a.prerelease > b.prerelease;
}

/**
 * Pick the installer asset for this platform from a release's assets.
 * @param {{ name: string, browser_download_url: string }[]} assets
 * @param {NodeJS.Platform} platform
 * @param {string} arch
 */
export function pickReleaseAsset(assets, platform, arch) {
  const list = Array.isArray(assets) ? assets : [];
  const byExt = (ext) =>
    list.filter((a) => a.name?.toLowerCase().endsWith(ext));
  if (platform === "darwin") {
    const dmgs = byExt(".dmg");
    return (
      dmgs.find((a) => a.name.includes(arch)) ??
      dmgs.find((a) => a.name.includes("universal")) ??
      dmgs[0] ??
      null
    );
  }
  if (platform === "win32") return byExt(".exe")[0] ?? null;
  if (platform === "linux")
    return byExt(".appimage")[0] ?? byExt(".deb")[0] ?? null;
  return null;
}

/**
 * Whether a background check is due.
 * @param {string | null} lastCheckAt ISO timestamp
 * @param {number} [now]
 */
export function isUpdateCheckDue(lastCheckAt, now = Date.now()) {
  if (!lastCheckAt) return true;
  const t = Date.parse(lastCheckAt);
  return !Number.isFinite(t) || now - t >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Fetch the latest release from GitHub. Returns null on any failure (offline,
 * rate limit, no releases) — an update check must never break the app.
 *
 * @param {string} repo "owner/name"
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ version: string, url: string, assets: {name: string, browser_download_url: string}[] } | null>}
 */
export async function fetchLatestRelease(
  repo,
  { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {},
) {
  if (typeof fetchImpl !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.tag_name !== "string") return null;
    return {
      version: json.tag_name,
      url: typeof json.html_url === "string" ? json.html_url : "",
      assets: Array.isArray(json.assets) ? json.assets : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
