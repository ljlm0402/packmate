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
import depcheck from 'depcheck';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import process from 'process';
import { getUpdateCandidates } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import {
  detectPackageManager,
  getPackageManagerInfo,
  setDetectedPackageManager,
} from '../src/detect-package-manager.js';
import { installPackages, uninstallPackages } from '../src/install-helper.js';
import { runWithWarningCapture, setProcessTracker } from '../src/warning-capture.js';
import { loadConfig, saveProjectConfig } from '../src/config-loader.js';
import { checkVulnerabilities } from '../src/security-checker.js';
import { getCacheManager } from '../src/enhanced-cache.js';
import {
  updateAvailableSession,
  unusedSession,
  notInstalledSession,
  latestSession,
  securitySession,
} from '../src/ui-sessions.js';

const require = createRequire(import.meta.url);

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
    hasSecurityIssues ? `${securitySummary.total} advisories` : '0 advisories',
    hasSecurityIssues
      ? `${securitySummary.direct || 0} direct, ${securitySummary.transitive || 0} transitive`
      : 'No known advisories',
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
    const securityUpdate = packageActions.find((action) => action.action === 'update' && action.packageName);
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

  return resolved;
}

async function confirmActions(actions) {
  const removes = actions.filter((action) => action.action === 'remove');
  const securityUpdates = actions.filter((action) => action.action === 'update' && action.packageName);
  const regularUpdates = actions.filter((action) => action.action === 'update' && !action.packageName);
  const installs = actions.filter((action) => action.action === 'install');

  console.log('\n' + chalk.cyan.bold('Review Actions'));
  if (removes.length > 0) {
    console.log(chalk.red.bold(`  Remove (${removes.length})`));
    removes.forEach((action) => console.log(chalk.red(`    - ${action.name}`)));
  }
  if (securityUpdates.length > 0) {
    console.log(chalk.yellow.bold(`  Security updates (${securityUpdates.length})`));
    securityUpdates.forEach((action) => console.log(chalk.yellow(`    - ${action.packageName} (${action.priority})`)));
  }
  if (regularUpdates.length > 0) {
    console.log(chalk.cyan.bold(`  Updates (${regularUpdates.length})`));
    regularUpdates.forEach((action) => console.log(chalk.cyan(`    - ${action.name} → ${action.latestVersion}`)));
  }
  if (installs.length > 0) {
    console.log(chalk.cyan.bold(`  Install (${installs.length})`));
    installs.forEach((action) => console.log(chalk.cyan(`    - ${action.name}`)));
  }

  const confirmed = await confirm({
    message: `Proceed with ${actions.length} action(s)?`,
    initialValue: true,
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

  // 실행 중인 모든 자식 프로세스 종료
  if (runningProcesses.size > 0) {
    console.log(chalk.yellow(`🛑 Terminating ${runningProcesses.size} running process(es)...`));
    
    for (const childProcess of runningProcesses) {
      try {
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGTERM');
          // 강제 종료를 위한 타임아웃
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 3000); // 3초 후 강제 종료
        }
      } catch (error) {
        // 프로세스 종료 중 에러 무시
      }
    }
    runningProcesses.clear();
  }

  // 캐시 정리
  try {
    const cacheManager = getCacheManager();
    await cacheManager.close();
  } catch (error) {
    // 캐시 정리 실패는 무시
  }

  console.log(chalk.blue('🧹 Cleanup complete. Exiting...'));
  outro(chalk.red('Packmate interrupted! 👋'));
  
  process.exit(signal === 'SIGTERM' ? 0 : 130); // Ctrl+C는 130 exit code
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

  process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('💥 Unhandled Promise Rejection:'), reason);
    gracefulExit('unhandledRejection');
  });
}

/**
 * 설치된 패키지의 현재 버전을 가져옵니다
 */
function getCurrentVersion(dep) {
  // 방법 1: 표준 node_modules 위치 확인 (npm, yarn, pnpm의 node-linker=hoisted에서 작동)
  try {
    const pkgPath = path.resolve(process.cwd(), 'node_modules', dep, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version;
    }
  } catch (err) {
    // 다음 방법으로 계속
  }

  // 방법 2: pnpm의 .pnpm 디렉토리 확인 (node-linker=isolated인 pnpm용)
  try {
    const pnpmDir = path.resolve(process.cwd(), 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const entries = fs.readdirSync(pnpmDir);
      // @clack/prompts 같은 스코프 패키지 처리
      const depName = dep.replace('/', '+');
      const found = entries.find((f) => f.startsWith(depName + '@'));
      if (found) {
        const pkgPath = path.resolve(pnpmDir, found, 'node_modules', dep, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          return pkg.version;
        }
      }
    }
  } catch (err) {
    // 다음 방법으로 계속
  }

  // 방법 3: require.resolve 시도 (일부 ESM 시나리오에서는 작동하지 않을 수 있음)
  try {
    const mainPath = require.resolve(`${dep}/package.json`, { paths: [process.cwd()] });
    if (mainPath && fs.existsSync(mainPath)) {
      const pkg = JSON.parse(fs.readFileSync(mainPath, 'utf-8'));
      return pkg.version;
    }
  } catch (err) {
    // 패키지를 찾을 수 없음
  }

  return null;
}

/**
 * 선언되었지만 설치되지 않은 패키지 목록을 가져옵니다
 */
function getNotInstalledPackages() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const notInstalled = [];

  for (const dep of Object.keys(allDeps)) {
    const version = getCurrentVersion(dep);
    if (!version) {  // null은 찾을 수 없음을 의미
      notInstalled.push(dep);
    }
  }

  return notInstalled;
}

async function main() {
  // 신호 핸들러 설정 (가장 먼저)
  setupSignalHandlers();

  // 프로세스 추적 설정
  setProcessTracker({
    onStart: (child) => {
      runningProcesses.add(child);
    },
    onEnd: (child) => {
      runningProcesses.delete(child);
    }
  });

  intro(chalk.cyan('📦 Packmate: Dependency Updates & Cleanup'));

  // 설정 로드
  const config = loadConfig();

  // node_modules 확인
  const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    note(
      chalk.yellow(
        '⚠️  The node_modules directory is missing. Please install dependencies first (npm/yarn/pnpm install).',
      ),
      'Warning',
    );
    process.exit(0);
  }

  const packageManager = await resolvePackageManager(config);
  const analysisSpinner = spinner();

  // 1. 미사용 패키지 먼저 분석 (업데이트 필터링용)
  analysisSpinner.start('Scanning project files...');
  const unused_precinct = await runUnusedCheck({ withUsedList: true });

  // depcheck로 교차 검증
  analysisSpinner.message('Checking dependency usage...');
  const depcheckResult = await depcheck(process.cwd(), {
    ignoreDirs: ['node_modules', 'backup', 'dist', 'build', 'coverage', '.git', '.packmate'],
  });
  const unused_depcheck = depcheckResult.dependencies || [];

  // 신뢰도별 분류
  const bothUnused = unused_precinct.unused.filter((x) => unused_depcheck.includes(x));
  const onlyPrecinct = unused_precinct.unused.filter((x) => !unused_depcheck.includes(x));
  const onlyDepcheck = unused_depcheck.filter((x) => !unused_precinct.unused.includes(x));

  // 필터링을 위한 모든 미사용 패키지 이름 가져오기
  const allUnusedNames = [...bothUnused, ...onlyPrecinct, ...onlyDepcheck];

  // 2. 업데이트 가능한 패키지 분석 (미사용 패키지 제외)
  analysisSpinner.message('Checking available updates...');
  const allUpdateCandidates = await getUpdateCandidates(packageManager, {
    showProgress: config.ui?.showProgress === true,
  });

  // 업데이트 후보에서 미사용 패키지 필터링
  const updateCandidates = allUpdateCandidates.filter(
    (candidate) => !allUnusedNames.includes(candidate.name)
  );

  const unusedPackages = [
    ...bothUnused.map((dep) => ({
      name: dep,
      current: getCurrentVersion(dep),
      confidence: 'high',
      hint: 'Detected by both precinct and depcheck',
    })),
    ...onlyPrecinct.map((dep) => ({
      name: dep,
      current: getCurrentVersion(dep),
      confidence: 'medium',
      hint: 'Detected by precinct only',
    })),
    ...onlyDepcheck.map((dep) => ({
      name: dep,
      current: getCurrentVersion(dep),
      confidence: 'medium',
      hint: 'Detected by depcheck only',
    })),
  ];

  // 3. 미설치 패키지 확인
  analysisSpinner.message('Checking install state...');
  const notInstalled = getNotInstalledPackages();

  const notInstalledPackages = notInstalled.map((dep) => ({
    name: dep,
    current: '-',
    latest: '-',
  }));

  // 4. 보안 취약성 검사 (설정에 따라)
  let securityResults = {
    vulnerabilities: [],
    classified: {},
    grouped: {},
    summary: { total: 0, direct: 0, transitive: 0, critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
  };
  
  if (config.security?.enabled !== false) {
    try {
      analysisSpinner.message('Checking security advisories...');
      securityResults = await checkVulnerabilities();
    } catch (error) {
      analysisSpinner.stop('Project analyzed');
      console.warn(chalk.dim('Security scan could not be completed. Continuing...'));
    }
  } else {
    analysisSpinner.stop('Project analyzed');
    console.log(chalk.dim('🔒 Security scan disabled in config'));
  }
  if (config.security?.enabled !== false) {
    analysisSpinner.stop('Project analyzed');
  }

  // 5. 최신 버전 패키지
  const pkgJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
  const declared = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const latestPackages = [];

  for (const dep of Object.keys(declared)) {
    const isUpdatable = updateCandidates.some((c) => c.name === dep);
    const isUnused = unusedPackages.some((u) => u.name === dep);
    const isNotInstalled = notInstalledPackages.some((n) => n.name === dep);

    if (!isUpdatable && !isUnused && !isNotInstalled) {
      const current = getCurrentVersion(dep);
      if (current && current !== '-') {
        latestPackages.push({
          name: dep,
          current,
          latest: current,
        });
      }
    }
  }

  renderAnalysisSummary({
    updateCount: updateCandidates.length,
    unusedCount: unusedPackages.length,
    notInstalledCount: notInstalledPackages.length,
    latestCount: latestPackages.length,
    securitySummary: securityResults.summary,
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
      const securitySelected = await securitySession(securityResults, config, {
        excludePackages: selectedRemoveNames,
      });
      selectedActions.push(...securitySelected);
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
    note(
      chalk.yellow('⚠️  groupSessions is disabled in config. Refer to packmate.js.backup for legacy mode.'),
      'Info',
    );
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

  // 보안 업데이트 실행 (우선순위: critical > high > moderate > low)
  const securityUpdates = selectedActions.filter((a) => a.action === 'update' && a.packageName);
  const priorityOrder = ['critical', 'high', 'moderate', 'low'];
  
  for (const priority of priorityOrder) {
    const priorityUpdates = securityUpdates.filter(a => a.priority === priority);
    
    for (const item of priorityUpdates) {
      let cmd, args;
      switch (packageManager) {
        case 'pnpm':
          cmd = 'pnpm';
          args = ['add', `${item.packageName}@latest`];
          break;
        case 'yarn':
          cmd = 'yarn';
          args = ['add', `${item.packageName}@latest`];
          break;
        case 'npm':
        default:
          cmd = 'npm';
          args = ['install', `${item.packageName}@latest`];
          break;
      }

      note(chalk.red(`🛡️  Security Update [${priority.toUpperCase()}]: ${cmd} ${args.join(' ')}`), 'Security Command');
      const { code, warnings, terminated, signal } = await runWithWarningCapture(cmd, args);

      // 사용자가 중단한 경우 즉시 종료
      if (terminated) {
        console.log(chalk.yellow(`\n⚠️  Security update interrupted by ${signal}`));
        return; // main 함수 종료
      }

      if (code === 0) {
        note(chalk.green(`✔️  Security update complete: ${item.packageName} (${priority})`), 'Security Success');
      } else {
        note(chalk.red(`❌ Security update failed: ${item.packageName} (${priority})`), 'Security Failed');
      }

      if (warnings.length) {
        note(chalk.yellow(`⚠️  Warnings:\n${warnings.map((w) => '  - ' + w).join('\n')}`), 'Warning');
      }
    }
  }

  // 일반 업데이트 실행
  const toUpdate = selectedActions.filter((a) => a.action === 'update' && !a.packageName);
  for (const item of toUpdate) {
    let cmd, args;
    switch (packageManager) {
      case 'pnpm':
        cmd = 'pnpm';
        args = ['add', `${item.name}@${item.latestVersion}`];
        break;
      case 'yarn':
        cmd = 'yarn';
        args = ['add', `${item.name}@${item.latestVersion}`];
        break;
      case 'npm':
      default:
        cmd = 'npm';
        args = ['install', `${item.name}@${item.latestVersion}`];
        break;
    }

    note(chalk.cyan(`${cmd} ${args.join(' ')}`), 'Command');
    const { code, warnings, terminated, signal } = await runWithWarningCapture(cmd, args);

    // 사용자가 중단한 경우 즉시 종료
    if (terminated) {
      console.log(chalk.yellow(`\n⚠️  Update interrupted by ${signal}`));
      return; // main 함수 종료
    }

    if (code === 0) {
      note(chalk.green(`✔️  Update complete: ${item.name}@${item.latestVersion}`), 'Success');
    } else {
      note(chalk.red(`❌ Update failed: ${item.name}@${item.latestVersion}`), 'Failed');
    }

    if (warnings.length) {
      note(chalk.yellow(`⚠️  Warnings:\n${warnings.map((w) => '  - ' + w).join('\n')}`), 'Warning');
    }
  }

  // 제거 실행
  const toRemove = selectedActions.filter((a) => a.action === 'remove').map((a) => a.name);
  if (toRemove.length > 0) {
    try {
      uninstallPackages(toRemove, packageManager);
    } catch (error) {
      if (error.signal === 'SIGTERM' || error.signal === 'SIGINT') {
        console.log(chalk.yellow(`\n⚠️  Package removal interrupted by ${error.signal}`));
        return; // main 함수 종료
      }
      // 다른 에러는 계속 진행
    }
  }

  // 설치 실행
  const toInstall = selectedActions.filter((a) => a.action === 'install').map((a) => a.name);
  if (toInstall.length > 0) {
    try {
      installPackages(toInstall, packageManager);
    } catch (error) {
      if (error.signal === 'SIGTERM' || error.signal === 'SIGINT') {
        console.log(chalk.yellow(`\n⚠️  Package installation interrupted by ${error.signal}`));
        return; // main 함수 종료
      }
      // 다른 에러는 계속 진행
    }
  }

  // 최종 요약 - console.log를 사용하여 더 나은 포맷팅
  const securityUpdateCount = securityUpdates.length;
  console.log('\n' + chalk.green.bold('✅ Complete:'));
  if (securityUpdateCount > 0) {
    console.log(chalk.green(`   Security:  ${securityUpdateCount} (vulnerabilities addressed)`));
  }
  console.log(chalk.green(`   Updated:   ${toUpdate.length}`));
  console.log(chalk.green(`   Removed:   ${toRemove.length}`));
  console.log(chalk.green(`   Installed: ${toInstall.length}`));

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
    } catch (error) {
      // 캐시 통계 오류는 무시
    }
  }

  outro(chalk.bold.cyan('Packmate complete! 🎉'));
}

main().catch((error) => {
  console.error(chalk.red('Error occurred:'), error);
  process.exit(1);
});
