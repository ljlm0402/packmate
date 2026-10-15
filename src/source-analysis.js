import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import ts from 'typescript';
import { glob } from 'tinyglobby';

const SOURCE_GLOB = '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}';
const UNSUPPORTED_GLOB = '**/*.{vue,svelte,astro,mdx,coffee}';
const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**', '**/.packmate/**'];
const BUILTINS = new Set(builtinModules);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export async function sourceFiles(root, config) {
  const options = {
    cwd: root,
    dot: true,
    followSymbolicLinks: false,
    ignore: [...ALWAYS_IGNORE, ...(config.detection?.ignorePaths || [])],
  };
  return {
    files: (await glob(SOURCE_GLOB, options)).sort(),
    unsupported: (await glob(UNSUPPORTED_GLOB, options)).sort(),
    configs: (
      await glob(
        ['**/*.{json,jsonc,yaml,yml}', '**/.{babelrc,eslintrc,prettierrc,postcssrc,swcrc}'],
        {
          ...options,
          ignore: [
            ...options.ignore,
            '**/package.json',
            '**/package-lock.json',
            '**/npm-shrinkwrap.json',
            '**/pnpm-lock.yaml',
            '**/packmate.config.json',
          ],
        },
      )
    ).sort(),
  };
}
export function normalizePackageName(specifier) {
  if (
    typeof specifier !== 'string' ||
    !specifier ||
    BUILTINS.has(specifier) ||
    specifier.startsWith('.') ||
    specifier.startsWith('#') ||
    path.isAbsolute(specifier) ||
    specifier.includes(':')
  )
    return null;
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}
export async function readSource(root, filename) {
  const fullPath = path.join(root, filename);
  if ((await fs.stat(fullPath)).size > MAX_SOURCE_BYTES)
    throw new Error('Source file exceeds 2 MiB analysis limit');
  return fs.readFile(fullPath, 'utf8');
}
export function parseReferences(content, filename, config) {
  const kind = /\.(?:ts|mts|cts)$/.test(filename)
    ? ts.ScriptKind.TS
    : filename.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : /\.jsx?$/.test(filename)
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
  const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, kind);
  if (source.parseDiagnostics.length)
    throw new Error(ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n'));
  const references = [];
  for (const entry of source.typeReferenceDirectives)
    references.push({ specifier: entry.fileName, kind: 'type-reference' });
  const unresolved = [];
  const add = (literal, kind) => {
    if (literal && (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)))
      references.push({ specifier: literal.text, kind });
    else unresolved.push('Computed module reference cannot be resolved statically');
  };
  const stack = [{ node: source, conditional: false }];
  while (stack.length) {
    const { node, conditional } = stack.pop();
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      add(node.moduleSpecifier, 'static-import');
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node.moduleReference.expression, 'static-import');
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal, 'type-import');
    else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))
      add(node.name, 'ambient-type-reference');
    else if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const requireResolve =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'require' &&
        node.expression.name.text === 'resolve';
      const amd = ts.isIdentifier(node.expression) && node.expression.text === 'define';
      if (
        amd ||
        (requireCall && node.arguments[0] && ts.isArrayLiteralExpression(node.arguments[0]))
      ) {
        const list = node.arguments.find((arg) => ts.isArrayLiteralExpression(arg));
        if (list) list.elements.forEach((element) => add(element, 'amd-import'));
      }
      const helper =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        ['jest', 'vi'].includes(node.expression.expression.text) &&
        [
          'mock',
          'doMock',
          'unmock',
          'requireActual',
          'requireMock',
          'importActual',
          'importMock',
        ].includes(node.expression.name.text);
      if (helper) add(node.arguments[0], 'test-module-reference');
      if (dynamic && config.detection?.dynamicImport !== false)
        add(node.arguments[0], 'dynamic-import');
      if (
        (requireCall && (!node.arguments[0] || !ts.isArrayLiteralExpression(node.arguments[0]))) ||
        requireResolve
      )
        add(
          node.arguments[0],
          conditional && config.detection?.conditionalRequire !== false
            ? 'conditional-require'
            : 'require',
        );
    }
    const inCondition =
      conditional ||
      ts.isIfStatement(node) ||
      ts.isTryStatement(node) ||
      ts.isConditionalExpression(node);
    ts.forEachChild(node, (child) => {
      stack.push({ node: child, conditional: inCondition });
    });
  }
  return { references, unresolved };
}
export function preprocessReferences(content) {
  const result = ts.preProcessFile(content, true, true);
  return [...result.importedFiles, ...result.typeReferenceDirectives].map(
    (entry) => entry.fileName,
  );
}

export function configTokens(content) {
  const tokens = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    content,
  );
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      [
        ts.SyntaxKind.StringLiteral,
        ts.SyntaxKind.NoSubstitutionTemplateLiteral,
        ts.SyntaxKind.Identifier,
      ].includes(token)
    )
      tokens.push(scanner.getTokenValue());
  }
  return tokens;
}

export function parseJsonConfig(content, filename) {
  const result = ts.parseConfigFileTextToJson(filename, content);
  if (result.error)
    throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'));
  return result.config;
}
