import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import packageJson from 'package-json';
import pMap from 'p-map';
import { loadConfig } from './config-loader.js';
import { analyzeUpdates } from './update-checker.js';
import { analyzeUsage } from './usage-analysis.js';
import { checkVulnerabilities, summarizeSecurity } from './security-checker.js';
import { discoverProjects, selectPackageManager, workspaceGraph } from './workspaces.js';
import { planSecurityUpdate } from './security-plan.js';

export async function analyzeProject({
  root = process.cwd(),
  workspaces = false,
  offline = false,
  readOnly = true,
  packageManager: preferredManager,
  fetchLatest = packageJson,
  fetchMetadata = (name) => packageJson(name, { allVersions: true }),
  audit = checkVulnerabilities,
  usage = analyzeUsage,
} = {}) {
  root = fs.realpathSync(root);
  const projects = await discoverProjects(root, { workspaces });
  const config = loadConfig({ root, strict: true });
  const packageManager = preferredManager || selectPackageManager(root, config);
  const graph = workspaceGraph(projects);
  // Audit once at the lockfile root. Workspace summaries share the same advisory snapshot.
  const auditManifest = {
    dependencies: Object.assign(
      {},
      ...projects.map((project) => ({
        ...project.manifest.dependencies,
        ...project.manifest.devDependencies,
        ...project.manifest.optionalDependencies,
      })),
    ),
  };
  const security =
    config.security?.enabled === false
      ? summarizeSecurity([], 'disabled')
      : offline
        ? summarizeSecurity([], 'unavailable', 'Offline mode')
        : await audit({ root, packageManager, manifest: auditManifest });
  const analyses = [];
  for (const project of projects) {
    const projectConfig =
      project.root === projects[0].root ? config : loadConfig({ root: project.root, strict: true });
    const excludedProjects = projects
      .filter((other) => other.root.startsWith(project.root + path.sep))
      .map((other) => `${path.relative(project.root, other.root).split(path.sep).join('/')}/**`);
    const scanConfig = {
      ...projectConfig,
      detection: {
        ...projectConfig.detection,
        ignorePaths: [...(projectConfig.detection?.ignorePaths || []), ...excludedProjects],
      },
    };
    const localNames = graph.edges
      .filter((edge) => edge.from === project.relativePath)
      .map((edge) => edge.packageName);
    const dependencies = await analyzeUpdates(packageManager, {
      root: project.root,
      lockRoot: root,
      manifest: project.manifest,
      config: projectConfig,
      readOnly,
      localNames,
      fetchLatest: offline
        ? async () => {
            throw new Error('Offline mode');
          }
        : fetchLatest,
    });
    const used = await usage(project.root, project.manifest, scanConfig);
    // Workspaces are retained as local graph edges, not cleanup candidates.
    for (const entry of used.entries)
      if (localNames.includes(entry.name)) {
        entry.status = 'ignored';
        entry.reasons = ['Local workspace dependency'];
      }
    if (
      !used.errors.length &&
      !used.crossError &&
      !used.entries.some((entry) => entry.status === 'uncertain')
    )
      used.status = 'completed';
    const peerVersions = Object.fromEntries(
      dependencies
        .filter((entry) => entry.installedVersion)
        .map((entry) => [entry.name, entry.installedVersion]),
    );
    const consumers = dependencies.flatMap((entry) => {
      if (!entry.installedVersion) return [];
      for (let directory = project.root; ; directory = path.dirname(directory)) {
        const filename = path.join(directory, 'node_modules', entry.name, 'package.json');
        if (fs.existsSync(filename)) {
          try {
            return [JSON.parse(fs.readFileSync(filename, 'utf8'))];
          } catch {
            return [];
          }
        }
        if (directory === path.resolve(root) || directory === path.dirname(directory)) return [];
      }
    });
    const securityPlans = await pMap(
      dependencies.filter((entry) => security.grouped[entry.name]?.length),
      async (entry) => {
        try {
          if (entry.status === 'ignored')
            return { name: entry.name, status: 'blocked', reason: 'Excluded by ignorePatterns' };
          if (offline || entry.kind !== 'registry')
            return {
              name: entry.name,
              status: 'blocked',
              reason: 'Registry metadata unavailable or unsupported specifier',
            };
          const metadata = await fetchMetadata(entry.registryName);
          return planSecurityUpdate(entry, security.grouped[entry.name], metadata, {
            peerVersions,
            dependentPeerRanges: consumers
              .map((consumer) => consumer.peerDependencies?.[entry.name])
              .filter(Boolean),
          });
        } catch (error) {
          return {
            name: entry.name,
            status: 'blocked',
            reason: `Metadata lookup failed: ${error.message}`,
          };
        }
      },
      { concurrency: 4 },
    );
    analyses.push({
      path: project.relativePath,
      name: project.manifest.name || null,
      dependencies,
      usage: used,
      securityPlans,
    });
  }
  const all = analyses.flatMap((project) => project.dependencies);
  return {
    schemaVersion: 1,
    packageManager,
    mode: offline ? 'offline' : 'online',
    projects: analyses,
    workspaceGraph: graph,
    security,
    summary: {
      projects: analyses.length,
      updates: all.filter((entry) => entry.status === 'update').length,
      unknown: all.filter((entry) => entry.status === 'unknown').length,
      unsupported: all.filter((entry) => entry.status === 'unsupported').length,
      missing: all.filter(
        (entry) => !entry.installed && !['unsupported', 'ignored'].includes(entry.status),
      ).length,
      unused: analyses
        .flatMap((project) => project.usage.entries)
        .filter((entry) => entry.status === 'candidate').length,
    },
  };
}
export function reportExitCode(report, { ci = false } = {}) {
  if (!ci) return 0;
  if (
    report.summary.unknown ||
    report.security.status === 'unavailable' ||
    report.projects.some((project) => project.usage.status !== 'completed')
  )
    return 2;
  return report.security.summary.total > 0 ||
    report.summary.updates > 0 ||
    report.summary.missing > 0
    ? 1
    : 0;
}
export function formatReport(report) {
  const lines = [
    `Packmate report (schema ${report.schemaVersion})`,
    `Manager: ${report.packageManager}; Projects: ${report.summary.projects}`,
    `Updates: ${report.summary.updates}; Unknown: ${report.summary.unknown}; Unsupported: ${report.summary.unsupported}; Missing: ${report.summary.missing}`,
    `Security: ${report.security.status}; Advisories: ${report.security.summary.total}`,
  ];
  if (report.security.error) lines.push(`  ${report.security.error}`);
  for (const project of report.projects) {
    lines.push(`\n${project.path} (${project.name || 'unnamed'})`);
    for (const entry of project.dependencies)
      lines.push(
        `  ${entry.name}: ${entry.status} ${entry.currentVersion || '?'} → ${entry.latestVersion || '?'}${entry.reason ? ` (${entry.reason})` : ''}`,
      );
    for (const entry of project.usage.entries.filter((item) =>
      ['candidate', 'uncertain'].includes(item.status),
    ))
      lines.push(
        `  ${entry.status}: ${entry.name} [${entry.confidence}] ${entry.reasons.join('; ')}`,
      );
    for (const entry of project.securityPlans)
      lines.push(
        `  Security plan: ${entry.name} ${entry.status} ${entry.latestVersion || ''} (${entry.reason})`,
      );
    for (const error of project.usage.errors)
      lines.push(`  Parse failure: ${error.file}: ${error.error}`);
  }
  for (const edge of report.workspaceGraph.edges)
    lines.push(`  Workspace: ${edge.from} → ${edge.to} (${edge.packageName})`);
  return lines.join('\n');
}
