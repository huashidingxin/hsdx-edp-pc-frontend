// 临时诊断脚本：BFS 探测 vite 模块导入链中挂起（超时）的请求
const BASE = 'http://localhost:5999';
const seen = new Set();
const queue = ['/src/views/config/settings/index.vue'];
const hung = [];
let count = 0;

async function importsOf(url) {
  const res = await fetch(BASE + url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { error: `${res.status} ${url}` };
  const text = await res.text();
  const urls = [...text.matchAll(/import\s+[^'"]*from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g)]
    .map((m) => m[1] || m[2] || m[3])
    .filter((u) => u && (u.startsWith('/') || u.startsWith('./') || u.startsWith('../')))
    .map((u) => {
      if (u.startsWith('/')) return u;
      const base = url.slice(0, url.lastIndexOf('/'));
      const parts = (base + '/' + u).split('/');
      const out = [];
      for (const p of parts) {
        if (p === '.') continue;
        else if (p === '..') out.pop();
        else out.push(p);
      }
      return out.join('/');
    });
  return { urls };
}

async function main() {
  const parents = new Map();
  while (queue.length && count < 400) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    count++;
    let r;
    try {
      r = await importsOf(url);
    } catch (e) {
      hung.push(`${url} -> ${e.name === 'TimeoutError' ? 'TIMEOUT(>8s)' : e.message}`);
      continue;
    }
    if (r.error) {
      hung.push(`${r.error}  <- imported by: ${parents.get(url) || '?'}`);
      continue;
    }
    for (const u of r.urls) {
      if (!seen.has(u)) {
        parents.set(u, url);
        queue.push(u);
      }
    }
  }
  console.log('scanned:', count);
  console.log('hung/broken:', hung.length ? hung : 'none');
}
main();
