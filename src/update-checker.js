import os from 'node:os';
import process from 'node:process';
import packageJson from 'package-json';
import pMap from 'p-map';
import semver from 'semver';
import { getCacheManager } from './enhanced-cache.js';
import { declaredDependencies, readManifest, resolveDependency } from './dependency-resolver.js';
import { loadConfig, shouldIgnorePackage } from './config-loader.js';

export async function getLatestVersions(
  names,
  { fetchLatest = packageJson, cache = null, cacheTTL = 3600000 } = {},
) {
  return Object.fromEntries(
    await pMap(
      names,
      async (name) => {
        try {
          const cached = cache ? await cache.get(name, cacheTTL) : null;
          if (cached?.data?.version) return [name, cached.data.version];
          const data = await fetchLatest(name);
          const version = typeof data === 'string' ? data : data.version;
          if (!semver.valid(version)) return [name, null];
          if (cache) await cache.set(name, { version });
          return [name, version];
        } catch {
          return [name, null];
        }
      },
      { concurrency: Math.min(Math.max(os.cpus().length, 4), 12) },
    ),
  );
}

export async function analyzeUpdates(
  packageManager = 'npm',
  {
    root = process.cwd(),
    lockRoot = root,
    manifest = readManifest(root),
    config = loadConfig({ root }),
    fetchLatest = packageJson,
    readOnly = true,
    localNames = [],
  } = {},
) {
  const cache =
    !readOnly && config.cache?.enabled !== false
      ? getCacheManager({
          memoryCacheSize: config.cache?.memorySize,
          cacheDir: config.cache?.directory,
        })
      : null;
  const resolutions = declaredDependencies(manifest).map((entry) =>
    resolveDependency(root, entry, { lockRoot, packageManager }),
  );
  const query = resolutions.filter(
    (entry) =>
      entry.registryName &&
      !localNames.includes(entry.name) &&
      !shouldIgnorePackage(entry.name, config),
  );
  const latest = await getLatestVersions([...new Set(query.map((entry) => entry.registryName))], {
    fetchLatest,
    cache,
    cacheTTL: config.cache?.diskTTL,
  });
  return resolutions.map((entry) => {
    const currentVersion = entry.installedVersion || entry.lockedVersion;
    const base = {
      ...entry,
      currentVersion,
      latestVersion: null,
      status: 'unknown',
      installed: Boolean(entry.installedVersion),
    };
    if (
      localNames.includes(entry.name) ||
      ['workspace', 'local', 'unsupported'].includes(entry.kind)
    )
      return { ...base, status: 'unsupported', reason: 'Local/workspace/non-registry specifier' };
    if (shouldIgnorePackage(entry.name, config))
      return { ...base, status: 'ignored', reason: 'ignorePatterns' };
    if (!currentVersion) return { ...base, reason: 'No authoritative installed or locked version' };
    if (
      entry.range &&
      semver.validRange(entry.range) &&
      !semver.satisfies(currentVersion, entry.range, { includePrerelease: true })
    )
      return { ...base, reason: 'Resolved version does not satisfy the declared range' };
    if (!latest[entry.registryName]) return { ...base, reason: 'Registry lookup failed' };
    const latestVersion = latest[entry.registryName];
    return {
      ...base,
      latestVersion,
      status: semver.lt(currentVersion, latestVersion) ? 'update' : 'current',
      updateType: semver.diff(currentVersion, latestVersion),
    };
  });
}

export async function getUpdateCandidates(packageManager = 'npm', options = {}) {
  return (await analyzeUpdates(packageManager, { readOnly: false, ...options })).filter(
    (entry) => entry.status === 'update',
  );
}
