import process from 'node:process';
import { readManifest, declaredDependencies } from './dependency-resolver.js';
import { readCommand } from './read-command.js';

export const SEVERITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MODERATE: 'moderate',
  LOW: 'low',
  INFO: 'info',
};
export class Vulnerability {
  constructor(data) {
    Object.assign(
      this,
      { source: 'npm-audit', direct: false, fixAvailable: null, inherited: false },
      data,
    );
  }
}
function severity(value) {
  return Object.values(SEVERITY_LEVELS).includes(value) ? value : 'low';
}

export function parseNpmAuditResult(data, { manifest = null, source = 'npm-audit' } = {}) {
  if (!data || data.error || (!data.advisories && !data.vulnerabilities))
    throw new Error(data?.error?.summary || 'Unrecognized audit response');
  const declared = manifest
    ? new Set(declaredDependencies(manifest).map((entry) => entry.name))
    : null;
  const results = [];
  for (const advisory of Object.values(data.advisories || {})) {
    results.push(
      new Vulnerability({
        packageName: advisory.module_name,
        affectedPackage: advisory.module_name,
        severity: severity(advisory.severity),
        title: advisory.title,
        advisoryUrl: advisory.url,
        vulnerableVersions: advisory.vulnerable_versions,
        patchedVersions: advisory.patched_versions,
        cve: advisory.cves?.[0] || null,
        source,
        direct: declared ? declared.has(advisory.module_name) : false,
      }),
    );
  }
  const vulnerabilities = data.vulnerabilities || {};
  const advisoriesFor = (name, seen = new Set()) => {
    if (seen.has(name)) return [];
    const next = new Set([...seen, name]);
    return (vulnerabilities[name]?.via || []).flatMap((via) =>
      typeof via === 'string'
        ? advisoriesFor(via, next)
        : via && typeof via === 'object'
          ? [via]
          : [],
    );
  };
  for (const [name, info] of Object.entries(vulnerabilities)) {
    const advisories = advisoriesFor(name);
    if (advisories.length === 0) {
      // Retain affected nodes even if advisory references are missing/cyclic.
      results.push(
        new Vulnerability({
          packageName: name,
          affectedPackage: name,
          severity: severity(info.severity),
          title: 'Indirect advisory details unavailable',
          vulnerableVersions: info.range,
          inherited: true,
          source,
          direct: declared ? declared.has(name) : info.isDirect === true,
          fixAvailable: info.fixAvailable ?? null,
        }),
      );
    }
    const seen = new Set();
    for (const via of advisories) {
      const id = via.source || via.url || `${via.name}:${via.title}:${via.range}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(
        new Vulnerability({
          packageName: name,
          affectedPackage: via.name || name,
          severity: severity(via.severity || info.severity),
          title: via.title,
          vulnerableVersions: via.range,
          packageRange: info.range,
          advisoryUrl: via.url,
          cve: Array.isArray(via.cves) ? via.cves.join(', ') : null,
          source,
          direct: declared ? declared.has(name) : info.isDirect === true,
          fixAvailable: info.fixAvailable ?? null,
          inherited: Boolean(via.name && via.name !== name),
        }),
      );
    }
  }
  return results;
}

export function parseAuditOutput(output, packageManager, options = {}) {
  const source = `${packageManager}-audit`;
  try {
    return parseNpmAuditResult(JSON.parse(output), { ...options, source });
  } catch (error) {
    if (packageManager !== 'yarn') throw error;
  }
  // Yarn Classic emits newline-delimited auditAdvisory and auditSummary events.
  const advisories = {};
  let summary = false;
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.data || 'Yarn audit failed');
    if (event.type === 'auditAdvisory' && event.data?.advisory) {
      const advisory = event.data.advisory;
      advisories[advisory.id || Object.keys(advisories).length] = advisory;
    }
    if (event.type === 'auditSummary') summary = true;
  }
  if (!summary && !Object.keys(advisories).length)
    throw new Error('Unrecognized Yarn audit response');
  return parseNpmAuditResult({ advisories }, { ...options, source });
}
export function groupVulnerabilitiesByPackage(vulnerabilities) {
  const groups = Object.create(null);
  for (const vuln of vulnerabilities) (groups[vuln.packageName] ||= []).push(vuln);
  return groups;
}
export function classifyBySeverity(vulnerabilities) {
  const classified = Object.fromEntries(Object.values(SEVERITY_LEVELS).map((level) => [level, []]));
  for (const vuln of vulnerabilities) classified[severity(vuln.severity)].push(vuln);
  return classified;
}
export function summarizeSecurity(vulnerabilities, status = 'completed', error = null) {
  const classified = classifyBySeverity(vulnerabilities);
  return {
    status,
    error,
    vulnerabilities,
    classified,
    grouped: groupVulnerabilitiesByPackage(vulnerabilities),
    summary: {
      total: vulnerabilities.length,
      direct: vulnerabilities.filter((vuln) => vuln.direct).length,
      transitive: vulnerabilities.filter((vuln) => !vuln.direct).length,
      ...Object.fromEntries(
        Object.entries(classified).map(([level, entries]) => [level, entries.length]),
      ),
    },
  };
}
export async function checkVulnerabilities({
  root = process.cwd(),
  packageManager = 'npm',
  enabled = true,
  run = readCommand,
  manifest = readManifest(root),
} = {}) {
  if (!enabled) return summarizeSecurity([], 'disabled');
  try {
    if (!['npm', 'pnpm', 'yarn'].includes(packageManager))
      throw new Error('Unsupported audit manager');
    let args = ['audit', '--json'];
    if (packageManager === 'yarn') {
      const version = await run('yarn', ['--version'], { cwd: root });
      if (version.code !== 0 || version.error) throw new Error('Yarn version unavailable');
      if (Number.parseInt(version.stdout, 10) >= 2)
        args = ['npm', 'audit', '--json', '--all', '--recursive'];
    }
    const result = await run(packageManager, args, { cwd: root });
    if (result.error || result.signal || result.code === null)
      throw new Error(result.error || 'Audit interrupted');
    const vulnerabilities = parseAuditOutput(result.stdout, packageManager, { manifest });
    // Nonzero audit codes represent findings only when findings are actually present.
    if (result.code !== 0 && vulnerabilities.length === 0)
      throw new Error('Audit failed without advisory data');
    return summarizeSecurity(vulnerabilities);
  } catch (error) {
    return summarizeSecurity([], 'unavailable', error.message);
  }
}
export async function checkNpmAudit(options = {}) {
  const result = await checkVulnerabilities({ ...options, packageManager: 'npm' });
  if (result.status !== 'completed') throw new Error(result.error);
  return result.vulnerabilities;
}
export function formatSecuritySummary(result) {
  if (result.status && result.status !== 'completed')
    return `Security: ${result.status}${result.error ? ` (${result.error})` : ''}`;
  return result.summary.total === 0
    ? 'No known vulnerabilities found.'
    : `Security: ${result.summary.total} advisories (${result.summary.direct} direct, ${result.summary.transitive} transitive)`;
}
