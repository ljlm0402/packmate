import process from 'node:process';
import semver from 'semver';

// Deliberately blocks unverifiable/transitive fixes instead of guessing a latest version.
export function planSecurityUpdate(
  dependency,
  advisories,
  metadata,
  { nodeVersion = process.versions.node, peerVersions = {}, dependentPeerRanges = [] } = {},
) {
  const blocked = (reason) => ({ name: dependency.name, status: 'blocked', reason });
  if (
    dependency.kind !== 'registry' ||
    !semver.valid(dependency.currentVersion) ||
    !semver.validRange(dependency.spec)
  )
    return blocked('A resolved registry dependency with a semver range is required');
  if (
    !advisories.length ||
    advisories.some(
      (advisory) => advisory.inherited || !semver.validRange(advisory.vulnerableVersions),
    )
  )
    return blocked('Transitive or incomplete advisory data requires manual review');
  if (
    !advisories.some((advisory) =>
      semver.satisfies(dependency.currentVersion, advisory.vulnerableVersions),
    )
  )
    return {
      name: dependency.name,
      status: 'not-affected',
      reason: 'This resolved version is outside the reported vulnerable ranges',
    };
  const versions = Object.keys(metadata?.versions || {})
    .filter(
      (version) =>
        semver.valid(version) &&
        !semver.prerelease(version) &&
        semver.gt(version, dependency.currentVersion),
    )
    .sort(semver.compare);
  let needsRangeChange = false;
  const valid = (version) => {
    const candidate = metadata.versions[version];
    if (
      candidate.deprecated ||
      advisories.some((advisory) => semver.satisfies(version, advisory.vulnerableVersions))
    )
      return false;
    if (
      candidate.engines?.node &&
      (!semver.validRange(candidate.engines.node) ||
        !semver.satisfies(nodeVersion, candidate.engines.node))
    )
      return false;
    for (const [name, range] of Object.entries(candidate.peerDependencies || {})) {
      const installed = peerVersions[name];
      if (!installed && candidate.peerDependenciesMeta?.[name]?.optional) continue;
      if (
        !semver.valid(installed) ||
        !semver.validRange(range) ||
        !semver.satisfies(installed, range)
      )
        return false;
    }
    if (
      dependentPeerRanges.some(
        (range) => !semver.validRange(range) || !semver.satisfies(version, range),
      )
    )
      return false;
    return true;
  };
  // Prefer staying within the declaration even if an out-of-range release is numerically lower.
  let target = versions.find(
    (version) => semver.satisfies(version, dependency.spec) && valid(version),
  );
  if (!target) {
    target = versions.find(valid);
    needsRangeChange = Boolean(target);
  }
  if (!target)
    return blocked('No non-deprecated stable fix satisfies known Node and peer constraints');
  return {
    name: dependency.name,
    status: 'ready',
    currentVersion: dependency.currentVersion,
    latestVersion: target,
    updateType: semver.diff(dependency.currentVersion, target),
    requiresRangeChange: needsRangeChange,
    requiresConfirmation:
      needsRangeChange || semver.major(target) !== semver.major(dependency.currentVersion),
    reason: needsRangeChange
      ? 'Smallest verified fix requires changing the declared range'
      : 'Smallest verified fix within the declared range',
    constraints:
      'Known advisory ranges, current Node engine and resolved direct peers; full installation compatibility is verified by the package manager',
  };
}
