import semver from 'semver';
import { runWithWarningCapture } from './warning-capture.js';

// Build commands as argument arrays; keep declared versions and dependency sections.
export function buildActionCommand(
  action,
  packageManager,
  manifest,
  { workspaceRoot = false } = {},
) {
  if (!['npm', 'pnpm', 'yarn'].includes(packageManager)) {
    throw new Error(`Unsupported package manager: ${packageManager}`);
  }
  const name = action.packageName || action.name;
  if (!/^(?:@[a-z0-9_~.-]+\/)?[a-z0-9_~.-]+$/i.test(name || '') || name.startsWith('-')) {
    throw new Error(`Invalid package name: ${name}`);
  }
  if (action.action === 'remove') {
    return {
      cmd: packageManager,
      args: [
        packageManager === 'npm' ? 'uninstall' : 'remove',
        name,
        ...(packageManager === 'pnpm' && workspaceRoot ? ['--workspace-root'] : []),
      ],
    };
  }
  if (!['install', 'update'].includes(action.action)) throw new Error('Unsupported action');
  const section = ['optionalDependencies', 'dependencies', 'devDependencies'].find((key) =>
    Object.hasOwn(manifest[key] || {}, name),
  );
  if (!section) throw new Error(`Package is not a supported direct dependency: ${name}`);
  const version =
    action.action === 'install' ? manifest[section][name] : action.latestVersion || 'latest';
  if (
    typeof version !== 'string' ||
    !version ||
    (!semver.validRange(version) && /[\s;&|`$<>"'\\%!()]/.test(version))
  ) {
    throw new Error(`Unsupported package specifier for ${name}: ${version}`);
  }
  const args = [packageManager === 'npm' ? 'install' : 'add', `${name}@${version}`];
  if (section === 'devDependencies') args.push(packageManager === 'npm' ? '--save-dev' : '--dev');
  if (section === 'optionalDependencies')
    args.push(packageManager === 'npm' ? '--save-optional' : '--optional');
  if (packageManager === 'pnpm' && workspaceRoot) args.push('--workspace-root');
  return { cmd: packageManager, args };
}

export async function executeActions(
  actions,
  packageManager,
  manifest,
  {
    run = runWithWarningCapture,
    cwd,
    workspaceRoot = false,
    onCommand = () => {},
    onResult = () => {},
  } = {},
) {
  // Validate the entire plan before executing any mutation.
  const plan = actions.map((action) => ({
    action,
    ...buildActionCommand(action, packageManager, manifest, { workspaceRoot }),
  }));
  const results = [];
  for (const entry of plan) {
    onCommand(entry);
    const result = await run(entry.cmd, entry.args, { cwd });
    results.push({ action: entry.action, ...result });
    onResult(results.at(-1));
    // Avoid compounding partial failures or continuing after interruption.
    if (result.code !== 0 || result.terminated) break;
  }
  return results;
}
