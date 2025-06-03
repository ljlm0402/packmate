import chalk from 'chalk';
import { execSync } from 'child_process';

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
    execSync(`${installCmd} ${pkgList}`, { stdio: 'inherit' });
    console.log(chalk.green(`Package install completed: ${pkgList}`));
  } catch (e) {
    console.error(chalk.red(`Package install failed: ${e.message}`));
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
    execSync(`${uninstallCmd} ${pkgList}`, { stdio: 'inherit' });
    console.log(chalk.green(`Package removal completed: ${pkgList}`));
  } catch (e) {
    console.error(chalk.red(`Package removal failed: ${e.message}`));
  }
}
