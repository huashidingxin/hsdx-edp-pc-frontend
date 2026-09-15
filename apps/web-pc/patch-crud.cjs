// 临时脚本：为使用 <AppCrudTable> 的视图补充显式导入（一次性，用完即删）
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '.');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const files = walk(path.join(root, 'src/views'));
let patched = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('<AppCrudTable')) continue;
  if (/import\s+AppCrudTable\b/.test(s)) continue;
  const m = s.match(/^[^\n]*<script[^>]*>\r?\n/);
  if (!m) {
    console.log('NO SCRIPT TAG:', f);
    continue;
  }
  s = s.replace(
    m[0],
    m[0] + "import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';\n",
  );
  fs.writeFileSync(f, s);
  patched++;
  console.log('patched:', path.relative(root, f));
}
console.log('total patched:', patched);
