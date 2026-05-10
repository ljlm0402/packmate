import chalk from 'chalk';
import { execSync } from 'child_process';
import process from 'process';

/**
 * 지정한 패키지들을 패키지 매니저를 사용해 설치합니다.
 */
export function installPackages(packages, packageManager) {
  if (packages.length === 0) return;
  let installCmd;
  switch (packageManager) {
    case 'pnpm':
      installCmd = 'pnpm add';
      break;
    case 'yarn':
      installCmd = 'yarn add';
      break;
    case 'npm':
    default:
      installCmd = 'npm install';
      break;
  }
  const pkgList = packages.map((pkg) => `${pkg}@latest`).join(' ');
  console.log(chalk.yellow(`> ${installCmd} ${pkgList}`));
  try {
    // Windows에서도 작동하도록 shell 옵션 추가
    // killSignal 옵션으로 신호 중단 지원
    execSync(`${installCmd} ${pkgList}`, { 
      stdio: 'inherit',
      shell: process.platform === 'win32' ? true : undefined,
      killSignal: 'SIGTERM', // 중단 시 사용할 신호
      timeout: 0 // 무제한 대기 (중단은 신호로만)
    });
    console.log(chalk.green(`Package install completed: ${pkgList}`));
  } catch (e) {
    // 신호로 인한 중단인지 확인
    if (e.signal === 'SIGTERM' || e.signal === 'SIGINT') {
      console.log(chalk.yellow(`\n⚠️  Package installation interrupted by ${e.signal}`));
      throw e; // 상위로 전파하여 graceful exit 처리
    } else {
      console.error(chalk.red(`Package install failed: ${e.message}`));
    }
  }
}

/**
 * 지정한 패키지들을 패키지 매니저를 사용해 제거합니다.
 */
export function uninstallPackages(packages, packageManager) {
  if (packages.length === 0) return;
  let uninstallCmd;
  switch (packageManager) {
    case 'pnpm':
      uninstallCmd = 'pnpm remove';
      break;
    case 'yarn':
      uninstallCmd = 'yarn remove';
      break;
    case 'npm':
    default:
      uninstallCmd = 'npm uninstall';
      break;
  }
  const pkgList = packages.join(' ');
  console.log(chalk.yellow(`> ${uninstallCmd} ${pkgList}`));
  try {
    // Windows에서도 작동하도록 shell 옵션 추가
    // killSignal 옵션으로 신호 중단 지원
    execSync(`${uninstallCmd} ${pkgList}`, { 
      stdio: 'inherit',
      shell: process.platform === 'win32' ? true : undefined,
      killSignal: 'SIGTERM', // 중단 시 사용할 신호
      timeout: 0 // 무제한 대기 (중단은 신호로만)
    });
    console.log(chalk.green(`Package removal completed: ${pkgList}`));
  } catch (e) {
    // 신호로 인한 중단인지 확인
    if (e.signal === 'SIGTERM' || e.signal === 'SIGINT') {
      console.log(chalk.yellow(`\n⚠️  Package removal interrupted by ${e.signal}`));
      throw e; // 상위로 전파하여 graceful exit 처리
    } else {
      console.error(chalk.red(`Package removal failed: ${e.message}`));
    }
  }
}
