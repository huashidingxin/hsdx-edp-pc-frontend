/**
 * 静态守卫：`_components/` 内部相对导入的具名导出必须真实存在。
 *
 * 背景（真实事故）：`PageContentManager.vue` 曾把 `looksLikeJsonText` 写在
 * `from './pageContentModel'` 的具名导入里，但该函数实际由 `./pageContentAutoForm` 导出。
 * 单元测试各自从**正确的路径**导入，所以全绿；`oxlint` 也查不出跨文件符号。
 * 只有真正加载组件时才会炸：
 *   SyntaxError: The requested module '.../pageContentModel.js' does not provide an export named 'looksLikeJsonText'
 * 这条用例把该检查前移到测试阶段。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = resolve(HERE, '..');

/** 扫描目录下所有 .js / .vue（跳过 __tests__）。 */
function sourceFiles() {
  return readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(?:js|vue)$/.test(e.name))
    .map((e) => e.name);
}

/**
 * 抽出 `import { a, b as c } from './x'` 形式的具名导入。
 * 只关心相对路径（`./`），因为只有同目录兄弟模块能这样静态校验。
 */
function namedImportsOf(source) {
  const found = [];
  // 允许换行、允许 `as` 重命名；捕获大括号内容与 from 后的路径
  const re = /import\s*\{([^}]*)\}\s*from\s*['"](\.\/[^'"]+)['"]/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const specifiers = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      // `a as b` → 真正被导入的名字是 `a`
      .map((s) => s.split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    found.push({ specifiers, from: match[2] });
  }
  return found;
}

/**
 * 该模块导出的具名符号集合。
 *
 * 用**静态解析**而不是 `import()`：这些模块内部用的是无扩展名的相对导入
 * （`from './pageContentModel'`），Vite 能解析、原生 Node ESM 不能，
 * 直接 `import()` 会 `ERR_MODULE_NOT_FOUND`。静态解析还顺带避免了
 * 「为了检查导入而真的执行模块」的副作用。
 */
function exportsOf(absPath) {
  const source = readFileSync(absPath, 'utf8');
  const names = new Set();

  // export function foo / export async function foo
  for (const m of source.matchAll(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export const/let/var foo
  for (const m of source.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export class foo
  for (const m of source.matchAll(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export { a, b as c }
  for (const m of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const raw of m[1].split(',')) {
      const spec = raw.trim();
      if (!spec) continue;
      const parts = spec.split(/\s+as\s+/);
      names.add((parts[1] ?? parts[0]).trim());
    }
  }
  if (/^\s*export\s+default\b/m.test(source)) names.add('default');

  return names;
}

describe('_components 内部相对导入的具名导出都存在', () => {
  const files = sourceFiles();

  it('至少扫描到组件目录下的源文件', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('导出解析器本身能认出真实导出（自检）', () => {
    const exported = exportsOf(join(COMPONENTS_DIR, 'pageContentAutoForm.js'));
    // 这两个正是出过事故的符号，必须被解析到
    expect(exported.has('looksLikeJsonText')).toBe(true);
    expect(exported.has('fieldKind')).toBe(true);
    expect(exported.has('notARealExport')).toBe(false);
  });

  for (const file of files) {
    it(`${file} 的每个相对具名导入都能在目标模块里找到`, () => {
      const source = readFileSync(join(COMPONENTS_DIR, file), 'utf8');
      const groups = namedImportsOf(source);
      const problems = [];

      for (const { specifiers, from } of groups) {
        // 只校验纯 JS 兄弟模块：.vue 里是默认导入，不在本检查范围。
        if (from.endsWith('.vue')) continue;

        // `./pageContentModel` → `pageContentModel.js`
        const base = join(COMPONENTS_DIR, from.replace(/^\.\//, ''));
        let target = null;
        for (const candidate of [`${base}.js`, `${base}.ts`, base]) {
          try {
            readFileSync(candidate, 'utf8');
            target = candidate;
            break;
          } catch {
            // 继续试下一个后缀
          }
        }
        if (!target) {
          problems.push(`${from}: 目标模块不存在`);
          continue;
        }

        const exported = exportsOf(target);
        for (const name of specifiers) {
          if (!exported.has(name)) {
            problems.push(`${from} 未导出 '${name}'`);
          }
        }
      }

      expect(problems, `${file} 的导入有误：\n  ${problems.join('\n  ')}`).toEqual([]);
    });
  }
});
