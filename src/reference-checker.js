import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { declaredDependencies } from './dependency-resolver.js';
import {
  normalizePackageName,
  preprocessReferences,
  readSource,
  sourceFiles,
  configTokens,
  parseJsonConfig,
} from './source-analysis.js';

// A lexical import pass plus manifest/config references. Never execute project configuration.
export async function checkReferences(root, { package: manifest, config } = {}) {
  const { files, unsupported, configs } = await sourceFiles(root, config);
  const configValues = new Map();
  const using = Object.create(null);
  const invalidFiles = Object.create(null);
  const record = (specifier, filename) => {
    const name = normalizePackageName(specifier);
    if (name && !(using[name] || []).includes(filename)) (using[name] ||= []).push(filename);
  };
  for (const file of files) {
    const filename = path.join(root, file);
    try {
      const content = await readSource(root, file);
      for (const specifier of preprocessReferences(content)) record(specifier, filename);
      if (/(?:config|rc)\.[cm]?[jt]sx?$/.test(path.basename(file)))
        configValues.set(filename, configTokens(content));
    } catch (error) {
      invalidFiles[filename] = { message: error.message };
    }
  }
  for (const file of unsupported)
    invalidFiles[path.join(root, file)] = {
      message: 'Unsupported source format; removal suggestions suppressed',
    };
  const collect = (value) => {
    const values = [];
    const pending = [value];
    const seen = new Set();
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === 'string') values.push(item);
      else if (item && typeof item === 'object' && !seen.has(item)) {
        seen.add(item);
        values.push(...Object.keys(item));
        pending.push(...Object.values(item));
      }
    }
    return values;
  };
  const metadata = { ...manifest };
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'packmate',
  ])
    delete metadata[field];
  configValues.set(path.join(root, 'package.json'), collect(metadata));
  for (const file of configs) {
    const filename = path.join(root, file);
    try {
      const content = await readSource(root, file);
      configValues.set(
        filename,
        collect(/\.jsonc?$/.test(file) ? parseJsonConfig(content, file) : yaml.load(content)),
      );
    } catch (error) {
      invalidFiles[filename] = { message: `Configuration could not be read: ${error.message}` };
    }
  }
  for (const entry of declaredDependencies(manifest)) {
    const binaries = new Set([entry.name, entry.name.split('/').at(-1)]);
    // Respect custom CLI names such as typescript -> tsc without loading module code.
    try {
      const installed = JSON.parse(
        await fs.readFile(path.join(root, 'node_modules', entry.name, 'package.json'), 'utf8'),
      );
      if (installed.bin && typeof installed.bin === 'object')
        Object.keys(installed.bin).forEach((name) => binaries.add(name));
    } catch {
      /* An uninstalled tool can still be referenced by its package name. */
    }
    for (const [filename, values] of configValues) {
      if (
        values.some((value) => {
          const tokens = value.split(/[\s"'`;&|!=()[\]{}]+/);
          return tokens.some((token) => {
            const value = token.replace(/^plugin:/, '');
            const normalized = normalizePackageName(value);
            const eslintPlugin = value.startsWith('@')
              ? value.split('/')[0] + '/eslint-plugin'
              : 'eslint-plugin-' + value.split('/')[0];
            return binaries.has(token) || normalized === entry.name || eslintPlugin === entry.name;
          });
        })
      )
        record(entry.name, filename);
    }
  }
  return {
    dependencies: Object.keys(manifest.dependencies || {}).filter((name) => !using[name]),
    devDependencies: Object.keys(manifest.devDependencies || {}).filter((name) => !using[name]),
    using,
    invalidFiles,
  };
}
