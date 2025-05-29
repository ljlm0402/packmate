import ncu from 'npm-check-updates';

export async function runUpdateCheck() {
  const upgrades = await ncu.run({ packageFile: './package.json' });
  return upgrades;
}
