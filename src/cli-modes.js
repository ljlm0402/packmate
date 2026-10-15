import fs from 'node:fs';
import process from 'node:process';
import { confirm, isCancel } from '@clack/prompts';
import { analyzeProject, formatReport, reportExitCode } from './report.js';
import { snapshotProject, createPlan, writePlan, restoreCheckpoint } from './checkpoints.js';
import { applyPlan } from './apply-plan.js';

const HELP = `Packmate
  packmate                         Interactive analysis and review
  packmate --report [--json]        Read-only dependency report
  packmate --ci [--json]            Read-only report with policy exit codes
  packmate --report --workspaces    Include declared workspace packages
  packmate --report --offline       Skip registry and audit calls (unknown stays unknown)
  packmate --plan plan.json         Write a reviewable update plan; no dependency changes
  packmate --apply plan.json        Confirm and execute an unchanged plan with a checkpoint
  packmate --restore <checkpoint>   Restore tracked manifests/lockfiles if unchanged since execution
  --yes                            Explicitly confirm apply/restore for automation
CI exit codes: 0 clean, 1 updates/advisories/missing packages, 2 incomplete analysis or execution error.
Restore does not restore node_modules or lifecycle-script side effects. Reinstall afterward.`;

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (['--plan', '--apply', '--restore'].includes(arg)) {
      if (options[arg.slice(2)] || !argv[index + 1] || argv[index + 1].startsWith('--'))
        throw new Error(`${arg} requires one value`);
      options[arg.slice(2)] = argv[++index];
    } else if (
      ['--report', '--json', '--ci', '--workspaces', '--offline', '--yes', '--help'].includes(arg)
    )
      options[arg.slice(2)] = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  const modes = ['plan', 'apply', 'restore'].filter((key) => options[key]);
  if (modes.length > 1) throw new Error('Choose one of --plan, --apply, --restore');
  if (
    (options.apply || options.restore) &&
    (options.report || options.ci || options.json || options.offline || options.workspaces)
  )
    throw new Error('Apply/restore cannot be combined with report options');
  if (options.yes && !options.apply && !options.restore)
    throw new Error('--yes is only valid for apply/restore');
  if (
    (options.json || options.offline || options.workspaces) &&
    !options.report &&
    !options.ci &&
    !options.plan
  )
    throw new Error('Use --report, --ci or --plan with report options');
  return options;
}
async function confirmMutation(message, yes) {
  if (yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Interactive confirmation required; use --yes to explicitly authorize unattended apply/restore',
    );
  const value = await confirm({ message, initialValue: false });
  return !isCancel(value) && value;
}
export async function runCliMode(argv, { root = process.cwd() } = {}) {
  if (!argv.length) return false;
  const options = parseArguments(argv);
  if (options.help) {
    console.log(HELP);
    return true;
  }
  if (options.restore) {
    if (
      !(await confirmMutation(
        `Restore manifests and lockfiles from checkpoint ${options.restore}?`,
        options.yes,
      ))
    )
      return true;
    restoreCheckpoint(root, options.restore);
    console.log('Project files restored. Reinstall dependencies to synchronize node_modules.');
    return true;
  }
  if (options.apply) {
    const plan = JSON.parse(fs.readFileSync(options.apply, 'utf8'));
    console.log(
      JSON.stringify({ packageManager: plan.packageManager, actions: plan.actions }, null, 2),
    );
    if (
      !(await confirmMutation(
        'Apply these exact updates and create a recovery checkpoint?',
        options.yes,
      ))
    )
      return true;
    const result = await applyPlan(root, plan, {
      onCommand: ({ cmd, args }) => console.log(`> ${cmd} ${args.join(' ')}`),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.results.some((entry) => entry.code !== 0 || entry.terminated)
      ? 1
      : result.security && result.security.status !== 'completed'
        ? 2
        : result.security?.summary.total
          ? 1
          : 0;
    return true;
  }
  const snapshot = options.plan
    ? await snapshotProject(root, { workspaces: options.workspaces })
    : null;
  if (options.plan && fs.existsSync(options.plan))
    throw new Error('Plan file already exists; choose a new output path');
  const report = await analyzeProject({
    root,
    workspaces: options.workspaces,
    offline: options.offline,
  });
  if (options.plan) writePlan(options.plan, createPlan(report, snapshot));
  console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
  if (options.plan && !options.json)
    console.log(`\nPlan written: ${options.plan}. Review it before --apply.`);
  process.exitCode = reportExitCode(report, { ci: options.ci });
  return true;
}
