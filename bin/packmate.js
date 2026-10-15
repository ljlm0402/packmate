#!/usr/bin/env node

/*****************************************************************
 * Packmate - Simple dependency update & unused checker
 * (c) 2025-present AGUMON (https://github.com/ljlm0402/packmate)
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the project root for more information.
 *
 * Made with ❤️ by AGUMON 🦖
 *****************************************************************/

import { intro, outro, note, select, isCancel, cancel, confirm, spinner } from '@clack/prompts';
import chalk from 'chalk';
import path from 'path';
import process from 'process';
import { analyzeProject } from '../src/report.js';
import { runCliMode } from '../src/cli-modes.js';
import { snapshotProject, createPlan } from '../src/checkpoints.js';
import { applyPlan } from '../src/apply-plan.js';
import {
  detectPackageManager,
  getPackageManagerInfo,
  setDetectedPackageManager,
} from '../src/detect-package-manager.js';
import { setProcessTracker } from '../src/warning-capture.js';
import { loadConfig, saveProjectConfig } from '../src/config-loader.js';
import { getCacheManager, getExistingCacheManager } from '../src/enhanced-cache.js';
import {
  updateAvailableSession,
  unusedSession,
  notInstalledSession,
  latestSession,
  securitySession,
} from '../src/ui-sessions.js';

// 글로벌 상태: 실행 중인 프로세스 추적
let runningProcesses = new Set();
let isExiting = false;

async function resolvePackageManager(config) {
  const { found, available } = getPackageManagerInfo();

  if (available.length === 0) {
    console.error(chalk.red('No package manager found. Please install npm, yarn, or pnpm.'));
    process.exit(1);
  }

  const availableLockManagers = found.filter((item) => item.available);

  if (config.packageManager && available.includes(config.packageManager)) {
    setDetectedPackageManager(config.packageManager);
    return config.packageManager;
  }

  if (availableLockManagers.length > 1) {
    const selected = await select({
      message: 'Multiple lock files found. Which package manager should PackMate use?',
      options: availableLockManagers.map((item) => ({
        label: item.name,
        value: item.name,
        hint: path.basename(item.filePath),
      })),
      initialValue: availableLockManagers[0].name,
    });

    if (isCancel(selected)) {
      cancel(chalk.red('Operation cancelled.'));
      process.exit(0);
    }

    setDetectedPackageManager(selected);

    const remember = await confirm({
      message: `Use ${selected} by default for this project?`,
      initialValue: true,
    });

    if (!isCancel(remember) && remember) {
      saveProjectConfig({ packageManager: selected });
      console.log(chalk.dim(`Saved package manager preference: ${selected}`));
    }

    return selected;
  }

  if (availableLockManagers.length === 1) {
    setDetectedPackageManager(availableLockManagers[0].name);
    return availableLockManagers[0].name;
  }

  return detectPackageManager({ silent: true });
}

function renderAnalysisSummary({
  updateCount,
  unusedCount,
  notInstalledCount,
  latestCount,
  securitySummary,
  securityStatus,
}) {
  const hasSecurityIssues = securitySummary.total > 0;
  const formatRow = (label, count, detail, color = chalk.white) => {
    const labelText = label.padEnd(10);
    const countText = String(count).padEnd(13);
    console.log(`  ${labelText} ${color(countText)} ${chalk.dim(detail)}`);
  };

  console.log('\n' + chalk.cyan.bold('Analysis Summary'));
  console.log(chalk.dim(`  ${'Category'.padEnd(10)} ${'Count'.padEnd(13)} Details`));
  formatRow('Updates', updateCount, 'Available package updates', chalk.cyan);
  formatRow('Unused', unusedCount, 'Possible cleanup candidates', chalk.yellow);
  formatRow('Missing', notInstalledCount, 'Declared but not installed', chalk.cyan);
  formatRow('Current', latestCount, 'Already up-to-date', chalk.green);
  formatRow(
    'Security',
    securityStatus !== 'completed'
      ? securityStatus
      : hasSecurityIssues
        ? `${securitySummary.total} advisories`
        : '0 advisories',
    hasSecurityIssues
      ? `${securitySummary.direct || 0} direct, ${securitySummary.transitive || 0} transitive`
      : securityStatus === 'completed'
        ? 'No known advisories'
        : 'Security was not verified',
    hasSecurityIssues ? chalk.red.bold : chalk.green,
  );
}

function getActionPackageName(action) {
  return action.packageName || action.name;
}

async function resolveConflictingActions(actions) {
  const byPackage = new Map();

  actions.forEach((action) => {
    const packageName = getActionPackageName(action);
    if (!packageName) return;

    if (!byPackage.has(packageName)) {
      byPackage.set(packageName, []);
    }
    byPackage.get(packageName).push(action);
  });

  const resolved = [...actions];

  for (const [packageName, packageActions] of byPackage.entries()) {
    const securityUpdate = packageActions.find(
      (action) => action.action === 'update' && action.packageName,
    );
    const remove = packageActions.find((action) => action.action === 'remove');

    if (!securityUpdate || !remove) continue;

    const choice = await select({
      message: `${packageName} is both vulnerable and marked unused. What should PackMate do?`,
      options: [
        {
          label: 'Remove package',
          value: 'remove',
          hint: 'Best if it is truly unused',
        },
        {
          label: 'Update package',
          value: 'update',
          hint: 'Use if the package is still needed',
        },
        {
          label: 'Skip for now',
          value: 'skip',
          hint: 'Make no change to this package',
        },
      ],
      initialValue: 'remove',
    });

    if (isCancel(choice)) {
      cancel(chalk.red('Operation cancelled.'));
      process.exit(0);
    }

    for (let i = resolved.length - 1; i >= 0; i--) {
      const action = resolved[i];
      if (getActionPackageName(action) !== packageName) continue;

      if (choice === 'remove' && action !== remove) {
        resolved.splice(i, 1);
      }
      if (choice === 'update' && action !== securityUpdate) {
        resolved.splice(i, 1);
      }
      if (choice === 'skip') {
        resolved.splice(i, 1);
      }
    }
  }

  return resolved.filter((action, index) => {
    const name = getActionPackageName(action);
    const peers = resolved.filter((other) => getActionPackageName(other) === name);
    const preferred =
      peers.find((other) => other.action === 'remove') ||
      peers.find((other) => other.action === 'update' && other.packageName) ||
      peers.find((other) => other.action === 'update') ||
      peers[0];
    return action === preferred && resolved.indexOf(action) === index;
  });
}

async function confirmActions(actions) {
  const removes = actions.filter((action) => action.action === 'remove');
  const securityUpdates = actions.filter(
    (action) => action.action === 'update' && action.packageName,
  );
  const regularUpdates = actions.filter(
    (action) => action.action === 'update' && !action.packageName,
  );
  const installs = actions.filter((action) => action.action === 'install');

  console.log('\n' + chalk.cyan.bold('Review Actions'));
  if (removes.length > 0) {
    console.log(chalk.red.bold(`  Remove (${removes.length})`));
    removes.forEach((action) => console.log(chalk.red(`    - ${action.name}`)));
  }
  if (securityUpdates.length > 0) {
    console.log(chalk.yellow.bold(`  Security updates (${securityUpdates.length})`));
    securityUpdates.forEach((action) =>
      console.log(
        chalk.yellow(
          `    - ${action.packageName} → ${action.latestVersion} (${action.priority})${action.requiresConfirmation ? ' [range/major change]' : ''}`,
        ),
      ),
    );
  }
  if (regularUpdates.length > 0) {
    console.log(chalk.cyan.bold(`  Updates (${regularUpdates.length})`));
    regularUpdates.forEach((action) =>
      console.log(chalk.cyan(`    - ${action.name} → ${action.latestVersion}`)),
    );
  }
  if (installs.length > 0) {
    console.log(chalk.cyan.bold(`  Install (${installs.length})`));
    installs.forEach((action) => console.log(chalk.cyan(`    - ${action.name}`)));
  }

  const confirmed = await confirm({
    message: `Proceed with ${actions.length} action(s)?`,
    initialValue: false,
  });

  if (isCancel(confirmed) || !confirmed) {
    console.log(chalk.yellow('\nNo changes were made.'));
    return false;
  }

  return true;
}

/**
 * 깨끗한 종료 처리
 */
async function gracefulExit(signal = 'SIGINT') {
  if (isExiting) return; // 이미 종료 중이면 중복 실행 방지
  isExiting = true;

  console.log(chalk.yellow(`\n⚠️  Received ${signal}. Cleaning up...`));

  await Promise.all(
    [...runningProcesses].map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          const force = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 3000);
          child.once('close', () => {
            clearTimeout(force);
            resolve();
          });
          child.kill('SIGTERM');
        }),
    ),
  );
  // Let the interrupted apply path persist its final checkpoint before exiting.
  await new Promise((resolve) => setImmediate(resolve));

  // 캐시 정리
  try {
    await getExistingCacheManager()?.close();
  } catch {
    // 캐시 정리 실패는 무시
  }

  console.log(chalk.blue('🧹 Cleanup complete. Exiting...'));
  outro(chalk.red('Packmate interrupted! 👋'));

  process.exit(signal === 'SIGTERM' ? 143 : signal === 'SIGINT' ? 130 : 1); // Ctrl+C는 130 exit code
}

/**
 * 신호 핸들러 설정
 */
function setupSignalHandlers() {
  // Ctrl+C (SIGINT)
  process.on('SIGINT', () => gracefulExit('SIGINT'));

  // Termination signal (SIGTERM)
  process.on('SIGTERM', () => gracefulExit('SIGTERM'));

  // Windows에서 CTRL+BREAK (SIGBREAK)
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => gracefulExit('SIGBREAK'));
  }

  // Uncaught Exception/Rejection 처리
  process.on('uncaughtException', (error) => {
    console.error(chalk.red('💥 Uncaught Exception:'), error);
    gracefulExit('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('💥 Unhandled Promise Rejection:'), reason);
    gracefulExit('unhandledRejection');
  });
}

async function main() {
  setupSignalHandlers();
  setProcessTracker({
    onStart: (child) => runningProcesses.add(child),
    onEnd: (child) => runningProcesses.delete(child),
  });
  if (await runCliMode(process.argv.slice(2))) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Interactive terminal required. No changes were made.');

  intro(chalk.cyan('📦 Packmate: Dependency Updates & Cleanup'));

  // 설정 로드
  const config = loadConfig();

  const packageManager = await resolvePackageManager(config);
  const beforeAnalysis = await snapshotProject(process.cwd());
  const analysisSpinner = spinner();
  analysisSpinner.start('Analyzing dependencies, usage evidence and security plans...');
  let report;
  try {
    report = await analyzeProject({ packageManager, readOnly: false });
  } finally {
    analysisSpinner.stop('Project analyzed');
  }
  const project = report.projects[0];
  const unusedPackages = project.usage.entries
    .filter(
      (entry) =>
        entry.status === 'candidate' &&
        ['registry', 'tag'].includes(
          project.dependencies.find((dep) => dep.name === entry.name)?.kind,
        ),
    )
    .map((entry) => ({
      ...entry,
      current: project.dependencies.find((dep) => dep.name === entry.name)?.currentVersion,
      hint: entry.reasons.join('; '),
    }));
  const unusedNames = new Set(unusedPackages.map((entry) => entry.name));
  const updateCandidates = project.dependencies.filter(
    (entry) =>
      entry.status === 'update' &&
      entry.kind === 'registry' &&
      !unusedNames.has(entry.name) &&
      !project.securityPlans.some((plan) => plan.name === entry.name && plan.status === 'blocked'),
  );
  const notInstalledPackages = project.dependencies
    .filter(
      (entry) =>
        !entry.installed && ['registry', 'tag'].includes(entry.kind) && entry.status !== 'ignored',
    )
    .map((entry) => ({ ...entry, current: '-', latest: '-' }));
  const latestPackages = project.dependencies
    .filter((entry) => entry.status === 'current')
    .map((entry) => ({
      name: entry.name,
      current: entry.currentVersion,
      latest: entry.latestVersion,
    }));
  const securityResults = report.security;
  const securityStatus = securityResults.status;
  const readyNames = new Set(
    project.securityPlans.filter((plan) => plan.status === 'ready').map((plan) => plan.name),
  );
  for (const plan of project.securityPlans.filter((plan) => plan.status === 'blocked'))
    note(`${plan.name}: ${plan.reason}`, 'Security: manual review required');
  if (report.summary.unknown)
    note(
      `${report.summary.unknown} dependencies could not be verified. See --report --json for reasons.`,
      'Unknown versions',
    );
  if (project.usage.status !== 'completed')
    note(
      'Some files could not be parsed. Affected removal candidates are suppressed; --report --json includes details.',
      'Incomplete usage analysis',
    );

  renderAnalysisSummary({
    updateCount: updateCandidates.length,
    unusedCount: unusedPackages.length,
    notInstalledCount: notInstalledPackages.length,
    latestCount: latestPackages.length,
    securitySummary: securityResults.summary,
    securityStatus,
  });

  let selectedActions = [];

  // === 그룹별 UI 세션 실행 ===
  if (config.ui?.groupSessions) {
    // 0. 미사용 패키지 정리 후보를 먼저 확인합니다.
    // 사용하지 않는 패키지는 업데이트보다 제거가 더 적절할 수 있습니다.
    if (unusedPackages.length > 0) {
      const unusedSelected = await unusedSession(unusedPackages, config);
      selectedActions.push(...unusedSelected);
    }

    const selectedRemoveNames = selectedActions
      .filter((action) => action.action === 'remove')
      .map((action) => action.name);

    // 1. 보안 취약성 세션
    if (securityResults.summary.total > 0) {
      const securitySelected = await securitySession(
        {
          ...securityResults,
          vulnerabilities: securityResults.vulnerabilities.filter((vuln) =>
            readyNames.has(vuln.packageName),
          ),
        },
        config,
        {
          excludePackages: selectedRemoveNames,
        },
      );
      selectedActions.push(
        ...securitySelected.map((action) => ({
          ...action,
          security: true,
          ...project.securityPlans.find((plan) => plan.name === action.packageName),
        })),
      );
    }

    // 2. 업데이트 가능 세션
    if (updateCandidates.length > 0) {
      const updateSelected = await updateAvailableSession(updateCandidates, config);
      selectedActions.push(...updateSelected);
    }

    // 3. 미설치 패키지 세션
    if (notInstalledPackages.length > 0) {
      const notInstalledSelected = await notInstalledSession(notInstalledPackages, config);
      selectedActions.push(...notInstalledSelected);
    }

    // 4. 최신 버전 패키지 세션 (선택 사항)
    if (latestPackages.length > 0) {
      await latestSession(latestPackages, config);
    }
  } else {
    throw new Error('groupSessions=false is unsupported. Enable it or use --report.');
  }

  // === 작업 실행 ===
  if (selectedActions.length === 0) {
    note(chalk.yellow('No actions selected.'), 'Info');
    outro(chalk.bold.cyan('Packmate complete! 👋'));
    return;
  }

  selectedActions = await resolveConflictingActions(selectedActions);

  if (selectedActions.length === 0) {
    note(chalk.yellow('No actions selected.'), 'Info');
    outro(chalk.bold.cyan('Packmate complete! 👋'));
    return;
  }

  const confirmed = await confirmActions(selectedActions);
  if (!confirmed) {
    outro(chalk.bold.cyan('Packmate complete! 👋'));
    return;
  }

  const plan = createPlan(report, beforeAnalysis);
  plan.actions = selectedActions.map((action) => ({
    ...action,
    project: '.',
    security: action.security || Boolean(report.security.grouped[getActionPackageName(action)]),
  }));
  const execution = await applyPlan(process.cwd(), plan, {
    onCommand: ({ cmd, args }) => note(chalk.cyan(`${cmd} ${args.join(' ')}`), 'Command'),
    onResult: ({ action, code, warnings = [] }) => {
      note(
        code === 0
          ? chalk.green(`Completed: ${getActionPackageName(action)}`)
          : chalk.red(`Failed: ${getActionPackageName(action)}`),
        'Result',
      );
      if (warnings.length) note(warnings.join('\n'), 'Warnings');
    },
  });
  const results = execution.results;
  if (execution.checkpointId)
    note(
      `Restore tracked files with: packmate --restore ${execution.checkpointId}`,
      'Recovery checkpoint',
    );
  if (execution.security) {
    note(
      `Security recheck: ${execution.security.status}; ${execution.security.summary.total} advisories`,
      'Verification',
    );
    if (execution.security.status !== 'completed' || execution.security.summary.total)
      process.exitCode = 1;
  }
  const completed = results.filter((result) => result.code === 0 && !result.terminated);
  const failed = results.length - completed.length;
  console.log(
    `\nCompleted: ${completed.length}; Failed: ${failed}; Skipped: ${selectedActions.length - results.length}`,
  );
  if (failed) process.exitCode = 1;
  // An update command succeeding does not prove that advisories were resolved.

  // Smart Cache 성능 통계 (설정에 따라)
  if (config.cache?.showStats !== false) {
    try {
      const cacheManager = getCacheManager();
      const cacheStats = await cacheManager.getDetailedStats();

      if (cacheStats.performance.totalRequests > 0) {
        console.log('\n' + chalk.blue.bold('📊 Cache Performance:'));
        console.log(chalk.blue(`   Hit Rate:      ${cacheStats.performance.hitRate}`));
        console.log(chalk.blue(`   Memory Hits:   ${cacheStats.performance.breakdown.memory}`));
        console.log(chalk.blue(`   Disk Hits:     ${cacheStats.performance.breakdown.disk}`));
        console.log(chalk.blue(`   Network Hits:  ${cacheStats.performance.breakdown.network}`));
        console.log(chalk.dim(`   Cache Size:    ${cacheStats.disk.diskSize}`));
      }

      if (config.cache?.autoCleanup !== false) {
        await cacheManager.cleanup();
      }
    } catch {
      // 캐시 통계 오류는 무시
    }
  }

  outro(
    chalk.bold.cyan(failed ? 'Packmate stopped after a failed action.' : 'Packmate complete! 🎉'),
  );
}

main().catch((error) => {
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ schemaVersion: 1, status: 'failed', error: error.message }));
  console.error(chalk.red(`Error: ${error.message}`));
  process.exitCode = process.argv.length > 2 ? 2 : 1;
});
