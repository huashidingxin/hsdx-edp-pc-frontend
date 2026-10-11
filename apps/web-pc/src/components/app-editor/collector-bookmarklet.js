/**
 * EDP 媒体资产采集助手 · 纯原生浏览器书签脚本 (Bookmarklet)
 *
 * 核心原理：
 * 1. 【无需安装任何浏览器扩展或插件】：利用浏览器诞生数十年的标准 Bookmarklet（书签小脚本）能力，将脚本存储为书签；
 * 2. 【在原网页上下文中运行】：用户在任意第三方网页（如微信公众号、知乎、头条等）浏览文章时，点击该书签；
 * 3. 【无视防盗链并复用本地缓存】：直接利用当前页面的同源/白名单 Referer 和连接状态，直接从浏览器的 Memory/Disk Cache 读取素材二进制 Blob；
 * 4. 【一键跨域转存 EDP】：将提取的 Blob 直传 EDP 后端 /uploads 接口，秒级入库阿里云 OSS 并生成永久外链。
 */

/**
 * 生成可直接在任意网页中执行的自包含采集器 JS 代码
 *
 * @param {Object} options
 * @param {string} options.apiBaseUrl EDP 后台 API 基础路径，如 https://admin.example.com/api/v1
 * @param {string} options.token 当前用户的授权令牌 Bearer Token
 * @returns {string} 完整的 JS 代码字符串
 */
export function buildCollectorScriptCode({ apiBaseUrl = '', token = '' } = {}) {
  const cleanApi = (apiBaseUrl || '').replace(/\/+$/, '');
  const cleanToken = token || '';

  return `(function () {
  'use strict';
  const PANEL_ID = 'edp-collector-modal-root';
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  let API_ENDPOINT = '${cleanApi}/admin/uploads';
  let AUTH_TOKEN = '${cleanToken}';

  function fixUrl(u) {
    return String(u || '')
      .replace(/\\\\x26/g, '&')
      .replace(/\\\\u0026/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/\\\\\\//g, '/')
      .replace(/^http:/, 'https:');
  }

  // 1. 扫描当前页面的媒体素材
  function scanMedia() {
    const list = [];
    const seen = new Set();

    // 扫描现有 video 标签
    document.querySelectorAll('video').forEach((v, idx) => {
      const src = fixUrl(v.currentSrc || v.src || v.querySelector('source')?.src);
      if (src && !seen.has(src) && !src.startsWith('blob:')) {
        seen.add(src);
        list.push({
          id: 'v-' + idx,
          type: 'video',
          url: src,
          name: (src.split('/').pop() || 'video.mp4').split('?')[0].slice(0, 40),
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
          selected: true,
          status: 'idle',
          newUrl: ''
        });
      }
    });

    // 扫描微信公众号全局 videoPageInfos / __videoPageInfos
    try {
      const infos = window.videoPageInfos || window.__videoPageInfos;
      if (Array.isArray(infos)) {
        infos.forEach((info, idx) => {
          if (info.sources && info.sources.length) {
            const best = info.sources[info.sources.length - 1];
            if (best && best.url) {
              const u = fixUrl(best.url);
              if (!seen.has(u)) {
                seen.add(u);
                list.push({
                  id: 'wx-v-' + idx,
                  type: 'video',
                  url: u,
                  name: (info.video_id || 'wx_video_' + idx) + '.mp4',
                  width: 0,
                  height: best.height || 0,
                  selected: true,
                  status: 'idle',
                  newUrl: ''
                });
              }
            }
          }
        });
      }
    } catch (_) {}

    // 从页面源代码正则兜底扫描微信视频信息 (应对闭包变量)
    try {
      const html = document.documentElement.innerHTML || '';
      const re = /format_id:\s*'(\\d+)'[\\s\\S]{0,600}?height:\s*'(\\d+)'[\\s\\S]{0,600}?url:\s*\\('([^']+)'\\)/g;
      let m;
      let extraIdx = 0;
      while ((m = re.exec(html))) {
        const u = fixUrl(m[3]);
        if (u && !seen.has(u)) {
          seen.add(u);
          list.push({
            id: 'extra-v-' + (extraIdx++),
            type: 'video',
            url: u,
            name: 'wx_video_' + (m[1] || 'hd') + '.mp4',
            width: 0,
            height: parseInt(m[2], 10) || 0,
            selected: true,
            status: 'idle',
            newUrl: ''
          });
        }
      }
    } catch (_) {}

    // 扫描图片 (优先懒加载 data-src，并过滤极小图标)
    document.querySelectorAll('img').forEach((img, idx) => {
      const raw = img.dataset.src || img.src;
      const src = fixUrl(raw);
      if (!src || src.startsWith('data:') || seen.has(src)) return;
      if (img.naturalWidth > 0 && img.naturalWidth < 60 && img.naturalHeight < 60) return;
      seen.add(src);
      list.push({
        id: 'img-' + idx,
        type: 'image',
        url: src,
        name: (src.split('/').pop() || 'image.png').split('?')[0].slice(0, 40),
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        selected: true,
        status: 'idle',
        newUrl: ''
      });
    });

    return list;
  }

  const items = scanMedia();

  // 2. 构建自包含悬浮窗口 UI
  const root = document.createElement('div');
  root.id = PANEL_ID;
  root.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:2147483647',
    'width:400px',
    'max-height:86vh',
    'background:#ffffff',
    'border:1px solid #cbd5e1',
    'border-radius:14px',
    'box-shadow:0 20px 45px rgba(15,23,42,0.25),0 2px 6px rgba(15,23,42,0.08)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    'font-size:13px',
    'color:#1e293b',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    'line-height:1.4'
  ].join(';');

  const videosCount = items.filter(i => i.type === 'video').length;
  const imagesCount = items.filter(i => i.type === 'image').length;

  root.innerHTML = \`
    <div style="padding:12px 16px;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:space-between;cursor:move;" id="edp-panel-header">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">📌</span>
        <div>
          <div style="font-weight:600;font-size:13px;line-height:1.2;">EDP 资产极速采集助手</div>
          <div style="font-size:11px;color:#94a3b8;">直接从当前浏览器缓存秒转存至 OSS</div>
        </div>
      </div>
      <button id="edp-close-btn" style="border:none;background:rgba(255,255,255,0.12);color:#e2e8f0;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>

    <!-- 顶部状态栏 -->
    <div style="padding:8px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;font-size:12px;">
      <div style="color:#64748b;">
        已嗅探: <strong>\${videosCount}</strong> 视频，<strong>\${imagesCount}</strong> 图片
      </div>
      <label style="cursor:pointer;display:flex;align-items:center;gap:4px;color:#0284c7;font-weight:500;">
        <input type="checkbox" id="edp-toggle-all" checked style="cursor:pointer;" /> 全选
      </label>
    </div>

    <!-- 手动追加 URL -->
    <div style="padding:8px 12px;background:#ffffff;border-bottom:1px solid #f1f5f9;display:flex;gap:6px;">
      <input id="edp-manual-url" placeholder="手动添加媒体链接..." style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:4px 8px;font-size:11px;outline:none;" />
      <button id="edp-manual-add" style="background:#e2e8f0;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:500;">添加</button>
    </div>

    <!-- 媒体列表 -->
    <div id="edp-list-container" style="flex:1;overflow-y:auto;max-height:340px;padding:8px 12px;background:#ffffff;">
      \${items.length === 0 ? '<div id="edp-empty-tip" style="text-align:center;color:#94a3b8;padding:35px 0;">未在页面检测到图片或视频，可在上方手动添加</div>' : items.map((item, idx) => \`
        <div class="edp-item-row" data-id="\${item.id}" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:6px;background:#f8fafc;border:1px solid #f1f5f9;">
          <input type="checkbox" class="edp-item-check" data-idx="\${idx}" \${item.selected ? 'checked' : ''} style="cursor:pointer;flex-shrink:0;" />
          <div style="width:40px;height:40px;background:#e2e8f0;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
            \${item.type === 'image'
              ? '<img src="' + item.url + '" style="width:100%;height:100%;object-fit:cover;" />'
              : '<span style="font-size:16px;color:#0284c7;">▶</span>'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#0f172a;" title="\${item.url}">
              \${item.name || '未命名'}
            </div>
            <div style="font-size:11px;color:#64748b;display:flex;gap:6px;align-items:center;margin-top:2px;">
              <span style="background:#e2e8f0;padding:1px 4px;border-radius:4px;text-transform:uppercase;font-size:9px;">\${item.type}</span>
              \${item.height ? '<span>' + item.height + 'P</span>' : ''}
              <span class="edp-status-tag" style="color:#0284c7;">就绪</span>
            </div>
          </div>
        </div>
      \`).join('')}
    </div>

    <!-- 底部操作与进度 -->
    <div style="padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <div id="edp-progress-text" style="font-size:11px;color:#64748b;margin-bottom:8px;display:none;"></div>
      <div style="display:flex;gap:8px;">
        <button id="edp-start-btn" style="flex:1;background:#0284c7;color:#ffffff;border:none;padding:9px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;box-shadow:0 2px 4px rgba(2,132,199,0.25);">
          一键从缓存转存至 EDP
        </button>
      </div>
      <div id="edp-result-actions" style="display:none;margin-top:10px;gap:8px;">
        <button id="edp-copy-urls" style="flex:1;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:6px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;">
          📋 复制全部站内 URL
        </button>
        <button id="edp-copy-md" style="flex:1;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:6px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;">
          📋 复制 Markdown
        </button>
      </div>
    </div>
  \`;

  document.body.appendChild(root);

  // 3. 绑定交互事件
  document.getElementById('edp-close-btn').onclick = () => root.remove();

  const toggleAll = document.getElementById('edp-toggle-all');
  toggleAll.onchange = (e) => {
    document.querySelectorAll('.edp-item-check').forEach(ck => {
      ck.checked = e.target.checked;
      const idx = parseInt(ck.dataset.idx, 10);
      if (items[idx]) items[idx].selected = e.target.checked;
    });
  };

  function bindCheckEvents() {
    document.querySelectorAll('.edp-item-check').forEach(ck => {
      ck.onchange = (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (items[idx]) items[idx].selected = e.target.checked;
      };
    });
  }
  bindCheckEvents();

  // 手动添加链接
  const manualInput = document.getElementById('edp-manual-url');
  const manualAddBtn = document.getElementById('edp-manual-add');
  const listContainer = document.getElementById('edp-list-container');
  manualAddBtn.onclick = () => {
    const rawVal = manualInput.value.trim();
    if (!rawVal) return;
    const u = fixUrl(rawVal);
    const isVideo = u.includes('.mp4') || u.includes('mpvideo.qpic.cn') || u.includes('video');
    const newItem = {
      id: 'manual-' + Date.now(),
      type: isVideo ? 'video' : 'image',
      url: u,
      name: (u.split('/').pop() || (isVideo ? 'video.mp4' : 'image.png')).split('?')[0].slice(0, 40),
      width: 0,
      height: 0,
      selected: true,
      status: 'idle',
      newUrl: ''
    };
    items.push(newItem);
    const emptyTip = document.getElementById('edp-empty-tip');
    if (emptyTip) emptyTip.remove();

    const row = document.createElement('div');
    row.className = 'edp-item-row';
    row.dataset.id = newItem.id;
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:6px;background:#f8fafc;border:1px solid #f1f5f9;';
    row.innerHTML = \`
      <input type="checkbox" class="edp-item-check" data-idx="\${items.length - 1}" checked style="cursor:pointer;flex-shrink:0;" />
      <div style="width:40px;height:40px;background:#e2e8f0;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        \${newItem.type === 'image'
          ? '<img src="' + newItem.url + '" style="width:100%;height:100%;object-fit:cover;" />'
          : '<span style="font-size:16px;color:#0284c7;">▶</span>'}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#0f172a;" title="\${newItem.url}">
          \${newItem.name}
        </div>
        <div style="font-size:11px;color:#64748b;display:flex;gap:6px;align-items:center;margin-top:2px;">
          <span style="background:#e2e8f0;padding:1px 4px;border-radius:4px;text-transform:uppercase;font-size:9px;">\${newItem.type}</span>
          <span class="edp-status-tag" style="color:#0284c7;">手动添加</span>
        </div>
      </div>
    \`;
    listContainer.appendChild(row);
    manualInput.value = '';
    bindCheckEvents();
  };

  // 一键转存
  const startBtn = document.getElementById('edp-start-btn');
  const progressText = document.getElementById('edp-progress-text');
  const resultActions = document.getElementById('edp-result-actions');

  startBtn.onclick = async () => {
    const selectedList = items.filter(i => i.selected && i.status !== 'success');
    if (!selectedList.length) {
      alert('请勾选要转存的素材！');
      return;
    }

    startBtn.disabled = true;
    startBtn.style.opacity = '0.6';
    startBtn.innerText = '正在转存中...';
    progressText.style.display = 'block';

    let successCount = 0;
    const uploadedUrls = [];

    for (let idx = 0; idx < selectedList.length; idx++) {
      const item = selectedList[idx];
      const row = document.querySelector('[data-id="' + item.id + '"]');
      const tag = row?.querySelector('.edp-status-tag');
      if (tag) {
        tag.innerText = '读取缓存中...';
        tag.style.color = '#f59e0b';
      }

      progressText.innerText = '正在读取并转存 (' + (idx + 1) + '/' + selectedList.length + '): ' + item.name;

      try {
        // 利用页面自身白名单 Referer 与缓存直接 fetch
        const resp = await fetch(item.url, { credentials: 'omit', referrerPolicy: 'unsafe-url' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();

        const ext = (blob.type.split('/')[1] || (item.type === 'video' ? 'mp4' : 'png')).replace('jpeg', 'jpg');
        const file = new File([blob], (item.name || 'file') + '.' + ext, { type: blob.type });

        if (tag) tag.innerText = '直传 EDP OSS...';

        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + AUTH_TOKEN
          },
          body: formData
        }).then(r => r.json());

        // 鉴权失效兼容
        if (uploadRes.status === 401 || uploadRes.code === 401) {
          const newToken = prompt('EDP 登录令牌已失效，请粘贴最新的 Token 并重试：');
          if (newToken) {
            AUTH_TOKEN = newToken.trim();
            // 重试一次
            const retryRes = await fetch(API_ENDPOINT, {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN },
              body: formData
            }).then(r => r.json());
            const newUrl = retryRes.data?.url || retryRes.url;
            if (!newUrl) throw new Error(retryRes.message || '重试失败');
            item.newUrl = newUrl;
            item.status = 'success';
            uploadedUrls.push(newUrl);
            successCount++;
            if (tag) { tag.innerText = '✅ 已入库'; tag.style.color = '#10b981'; }
            continue;
          }
        }

        const newUrl = uploadRes.data?.url || uploadRes.url;
        if (!newUrl) throw new Error(uploadRes.message || '上传未返回新 URL');

        item.newUrl = newUrl;
        item.status = 'success';
        uploadedUrls.push(newUrl);
        successCount++;

        if (tag) {
          tag.innerText = '✅ 已入库';
          tag.style.color = '#10b981';
        }
      } catch (err) {
        item.status = 'error';
        if (tag) {
          tag.innerText = '❌ ' + (err.message || '失败');
          tag.style.color = '#ef4444';
        }
      }
    }

    startBtn.disabled = false;
    startBtn.style.opacity = '1';
    startBtn.innerText = '转存完成 (成功 ' + successCount + '/' + selectedList.length + ')';
    progressText.innerText = '🎉 已成功转存 ' + successCount + ' 项素材至 EDP 资产库！';

    if (uploadedUrls.length) {
      resultActions.style.display = 'flex';

      document.getElementById('edp-copy-urls').onclick = () => {
        navigator.clipboard.writeText(uploadedUrls.join(String.fromCharCode(10)));
        alert('已复制 ' + uploadedUrls.length + ' 个站内永久 URL 到剪贴板！');
      };

      document.getElementById('edp-copy-md').onclick = () => {
        const md = uploadedUrls.map(u => u.includes('.mp4') ? '<video src="' + u + '" controls></video>' : '![](' + u + ')').join(String.fromCharCode(10, 10));
        navigator.clipboard.writeText(md);
        alert('已复制 Markdown 嵌入代码到剪贴板！');
      };
    }
  };
})();`;
}

/**
 * 将采集器脚本打包为可直接拖入或加入浏览器书签栏的 bookmarklet: URL
 */
export function getBookmarkletHref(options = {}) {
  const code = buildCollectorScriptCode(options);
  return 'javascript:' + encodeURIComponent(code);
}

/**
 * 在当前页面直接执行采集助手，用于开发调试与用户即时体验
 */
export function runCollectorInCurrentPage(options = {}) {
  const code = buildCollectorScriptCode(options);
  try {
    const fn = new Function(code);
    fn();
  } catch (_) {
    const scriptEl = document.createElement('script');
    scriptEl.textContent = code;
    document.body.appendChild(scriptEl);
    scriptEl.remove();
  }
}
