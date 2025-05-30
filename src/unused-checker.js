import fs from 'fs-extra';
import { globby } from 'globby';
import precinct from 'precinct';
import path from 'path';

export async function runUnusedCheck() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkgJson = await fs.readJSON(pkgPath);
  const declared = [...Object.keys(pkgJson.dependencies || {}), ...Object.keys(pkgJson.devDependencies || {})];
  const used = new Set();

  // js/ts 확장자별 precinct 타입 매핑
  const extToType = {
    '.js': 'es6',
    '.jsx': 'es6',
    '.ts': 'ts',
    '.tsx': 'tsx',
  };

  const files = await globby(['**/*.{js,ts,jsx,tsx}', '!node_modules/**']);

  for (const file of files) {
    const ext = path.extname(file);
    const type = extToType[ext] || 'es6';

    const content = await fs.readFile(file, 'utf8');
    let deps;
    try {
      deps = precinct(content, { type });
    } catch {
      deps = [];
    }

    deps.forEach(dep => {
      // 상대 경로나 내부 모듈 제외 (패키지명만 추출)
      if (!dep || dep.startsWith('.') || path.isAbsolute(dep)) return;
      const pkgName = dep.split('/')[0].startsWith('@') && dep.includes('/') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0];
      used.add(pkgName);
    });
  }

  const unused = declared.filter(dep => !used.has(dep));
  return unused;
}
