import fs from 'fs-extra';
import globby from 'globby';
import precinct from 'precinct';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export async function runUnusedCheck() {
  const pkg = require('../package.json');
  const declared = Object.keys(pkg.dependencies || {});
  const used = new Set();

  const files = await globby(['**/*.js', '**/*.ts', '!node_modules']);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const deps = precinct(content, { type: 'es6' });
    deps.forEach(dep => used.add(dep));
  }

  const unused = declared.filter(dep => !used.has(dep));
  return unused;
}
