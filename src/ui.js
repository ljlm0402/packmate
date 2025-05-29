import { prompt } from 'enquirer';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { detectPackageManager } from './detect-package-manager.js';

export async function promptActions(upgrades, unused) {
  const packageManager = detectPackageManager();

  const upgradeChoices = Object.entries(upgrades).map(([pkg, version]) => ({
    name: pkg,
    message: `${pkg} → ${version}`,
    checked: true
  }));

  const unusedChoices = unused.map(pkg => ({
    name: pkg,
    message: `${pkg} (unused)`,
    checked: false
  }));

  const { toUpdate } = await prompt({
    type: 'multiselect',
    name: 'toUpdate',
    message: chalk.cyan('업데이트할 패키지를 선택하세요:'),
    choices: upgradeChoices
  });

  const { toRemove } = await prompt({
    type: 'multiselect',
    name: 'toRemove',
    message: chalk.red('삭제할 미사용 패키지를 선택하세요:'),
    choices: unusedChoices
  });

  const run = (command) => {
    console.log(chalk.gray(`$ ${command}`));
    execSync(command, { stdio: 'inherit' });
  };

  if (toUpdate.length > 0) {
    console.log(chalk.green('\n📦 Updating packages...'));
    const updateCommand = {
      npm: (pkg, ver) => `npm install ${pkg}@${ver}`,
      yarn: (pkg, ver) => `yarn add ${pkg}@${ver}`,
      pnpm: (pkg, ver) => `pnpm add ${pkg}@${ver}`
    }[packageManager];

    toUpdate.forEach(pkg => {
      const ver = upgrades[pkg];
      run(updateCommand(pkg, ver));
    });
  }

  if (toRemove.length > 0) {
    console.log(chalk.yellow('\n🧹 Removing unused packages...'));
    const uninstallCommand = {
      npm: `npm uninstall ${toRemove.join(' ')}`,
      yarn: `yarn remove ${toRemove.join(' ')}`,
      pnpm: `pnpm remove ${toRemove.join(' ')}`
    }[packageManager];

    run(uninstallCommand);
  }

  console.log(chalk.bold.cyan('\n✅ PackMate 작업 완료!'));
}
