/**
 * 解码 URL 中可能存在的 HTML 实体（如 &amp; 还原为 &）
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

import { requestClient } from '#/api/request';

/**
 * 默认本站免检（站内）域名列表：包含用户指定的 cdn-edp.hsdxchina.com 以及本地环境
 */
export const DEFAULT_INTERNAL_DOMAINS = [
  'cdn-edp.hsdxchina.com',
  'localhost',
  '127.0.0.1',
];

/**
 * 标准化域名字符串（去除协议、端口、路径与前后空格）
 */
export function normalizeDomain(domain) {
  if (!domain || typeof domain !== 'string') return '';
  let d = domain.trim().toLowerCase();
  // 移除协议头 http://, https://, //
  d = d.replace(/^https?:\/\//, '').replace(/^\/\//, '');
  // 移除路径和 query
  d = d.split('/')[0].split('?')[0].split('#')[0];
  // 移除端口号
  d = d.split(':')[0];
  return d.trim();
}

/**
 * 判断一个 URL 是否属于外部网络外链资源
 *
 * @param {string} url 资源链接
 * @param {string[]} [internalDomains=DEFAULT_INTERNAL_DOMAINS] 本站免检域名白名单
 * @returns {boolean} true: 外部链接；false: 内部/相对链接
 */
/**
 * 清洗 URL 候选字符串，剥离首尾引号、转义符与空格
 */
export function cleanUrlCandidate(url) {
  if (!url || typeof url !== 'string') return '';
  let str = decodeHtmlEntities(url.trim());
  // 剥除反斜杠转义（如从 JSON 或 JS 变量中拷贝出的 \/ ）
  str = str.replace(/\\\//g, '/');
  // 剥除首尾可能的引号、括号、分号、逗号、空格
  str = str.replace(/^['"\s(]+|['"\s);,]+$/g, '').trim();
  return str;
}

/**
 * 判断两个 URL 是否指向同一个底层媒体资源（兼容微信 CDN 参数变体、微信视频 vid 及实体编码差异）
 */
export function isSameMediaAsset(urlA, urlB) {
  if (!urlA || !urlB) return false;
  const cleanA = cleanUrlCandidate(urlA);
  const cleanB = cleanUrlCandidate(urlB);
  if (cleanA === cleanB) return true;

  // 微信视频 vid 跨参数比对 (如 wxv_123456)
  const vidA = cleanA.match(/wxv_\d+/)?.[0];
  const vidB = cleanB.match(/wxv_\d+/)?.[0];
  if (vidA && vidB && vidA === vidB) return true;

  // 针对 CDN 资源进行域名与路径深度比对（忽略微信/CDN 附加的实时 format、tp=webp、from 等参数差异）
  try {
    const fullA = cleanA.startsWith('//') ? `http:${cleanA}` : cleanA.startsWith('http') ? cleanA : `http://${cleanA}`;
    const fullB = cleanB.startsWith('//') ? `http:${cleanB}` : cleanB.startsWith('http') ? cleanB : `http://${cleanB}`;
    const pA = new URL(fullA);
    const pB = new URL(fullB);
    const hostA = pA.hostname.toLowerCase();
    const hostB = pB.hostname.toLowerCase();

    // 域名一致或属于同一个 CDN 主域（如 mmbiz.qpic.cn）
    const isSameHost = hostA === hostB || (hostA.endsWith('qpic.cn') && hostB.endsWith('qpic.cn'));
    if (isSameHost && pA.pathname && pA.pathname.length > 8 && pA.pathname === pB.pathname) {
      return true;
    }
  } catch {}

  return false;
}
/**
 * 提取 CSS 文本中的所有 url(...) 地址（如 background / background-image）
 * 完整提取 URL，支持各类引号、实体引号与复杂 query 参数，绝不截断 & 与 &amp;
 */
export function extractUrlsFromCss(cssText) {
  if (!cssText || typeof cssText !== 'string') return [];
  const urls = [];
  const cssUrlRegex = /url\(\s*(?:(['"]|&quot;|&#39;)(.*?)\1|([^\s)'"]+))\s*\)/gi;
  let match;
  while ((match = cssUrlRegex.exec(cssText)) !== null) {
    const raw = match[2] || match[3] || '';
    if (raw) {
      const clean = cleanUrlCandidate(raw);
      if (clean && !clean.startsWith('data:') && !urls.includes(clean)) {
        urls.push(clean);
      }
    }
  }
  return urls;
}

/**
 * 判断一个 URL 是否属于外部网络外链资源
 *
 * @param {string} url 资源链接
 * @param {string[]} [internalDomains=DEFAULT_INTERNAL_DOMAINS] 本站免检域名白名单
 * @returns {boolean} true: 外部链接；false: 内部/相对链接
 */
export function isExternalAssetUrl(
  url,
  internalDomains = DEFAULT_INTERNAL_DOMAINS,
) {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = cleanUrlCandidate(url);

  // 空值、锚点、非 HTTP(S) 特殊协议（如 data: base64、blob:、javascript:）不算外链
  if (
    !cleanUrl ||
    cleanUrl.startsWith('#') ||
    cleanUrl.startsWith('data:') ||
    cleanUrl.startsWith('blob:') ||
    cleanUrl.startsWith('javascript:') ||
    cleanUrl.startsWith('mailto:') ||
    cleanUrl.startsWith('tel:')
  ) {
    return false;
  }

  // 相对路径（以 / 或 ./ 或 ../ 开头）视为站内本地资源
  if (
    cleanUrl.startsWith('/') &&
    !cleanUrl.startsWith('//')
  ) {
    return false;
  }
  if (cleanUrl.startsWith('./') || cleanUrl.startsWith('../')) {
    return false;
  }

  // 提取域名
  let hostname = '';
  try {
    const fullUrl = cleanUrl.startsWith('//')
      ? `http:${cleanUrl}`
      : cleanUrl.startsWith('http')
        ? cleanUrl
        : `http://${cleanUrl}`;
    const parsed = new URL(fullUrl);
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }

  if (!hostname) return false;

  // 合并检查白名单
  const mergedDomains = new Set(
    (internalDomains || []).map(normalizeDomain).filter(Boolean),
  );

  // 自动将当前网页宿主加入白名单
  if (typeof window !== 'undefined' && window.location?.hostname) {
    mergedDomains.add(normalizeDomain(window.location.hostname));
  }

  // 检查是否匹配任何站内免检域名（支持精确匹配及子域名）
  for (const internal of mergedDomains) {
    if (hostname === internal || hostname.endsWith(`.${internal}`)) {
      return false;
    }
  }

  return true;
}

/**
 * 从 HTML 正文中无死角全量扫描检测所有使用的外链媒体资源
 * （结合 DOMParser 深度节点属性分析与全局 Regex 补漏引擎，覆盖 CSS 背景图、图片 data-src 占位、SVG image、视频封面等）
 *
 * @param {string} html 正文内容
 * @param {string[]} [internalDomains=DEFAULT_INTERNAL_DOMAINS]
 * @returns {Array<{ id: string, url: string, originalUrl: string, type: string, name: string, count: number, selected: boolean, status: string, newUrl: string, errorMsg: string }>}
 */
export function extractExternalAssets(
  html,
  internalDomains = DEFAULT_INTERNAL_DOMAINS,
) {
  if (!html || typeof html !== 'string') return [];

  const foundMap = new Map();

  let domParsed = false;
  // 1. 若运行于 DOM 环境（浏览器 / happy-dom），优先进行 DOM 树全节点精确分析
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const allElements = doc.body.querySelectorAll('*');

      allElements.forEach((el) => {
        const tag = el.tagName.toLowerCase();

        // A. 图片标签 (<img ...>)
        if (tag === 'img') {
          // 遍历所有可能的真实图片来源属性（微信文章通常将真实 URL 置于 data-src / data-actualsrc）
          const candidateAttrs = [
            'data-src',
            'data-original',
            'data-actualsrc',
            'data-croporisrc',
            'data-url',
            'data-lazy-src',
            'src',
          ];
          for (const attr of candidateAttrs) {
            const val = el.getAttribute(attr);
            if (val) {
              const clean = cleanUrlCandidate(val);
              if (clean && !clean.startsWith('data:') && isExternalAssetUrl(clean, internalDomains)) {
                recordAsset(foundMap, clean, 'image');
              }
            }
          }

          // 检查 srcset / data-srcset
          const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
          if (srcset) {
            srcset
              .split(',')
              .map((p) => p.trim().split(/\s+/)[0])
              .filter(Boolean)
              .forEach((s) => {
                const clean = cleanUrlCandidate(s);
                if (clean && !clean.startsWith('data:') && isExternalAssetUrl(clean, internalDomains)) {
                  recordAsset(foundMap, clean, 'image');
                }
              });
          }
        }

        // B. 视频、音频、媒体源 (<video>, <audio>, <source>)
        else if (tag === 'video' || tag === 'audio' || tag === 'source') {
          const isAudio = tag === 'audio' || el.closest('audio');
          const candidateAttrs = ['src', 'data-src', 'data-url'];
          for (const attr of candidateAttrs) {
            const val = el.getAttribute(attr);
            if (val) {
              const clean = cleanUrlCandidate(val);
              if (clean && !clean.startsWith('data:') && isExternalAssetUrl(clean, internalDomains)) {
                recordAsset(foundMap, clean, isAudio ? 'audio' : isVideoUrl(clean) ? 'video' : 'media');
              }
            }
          }

          // 视频海报封面图 poster
          if (tag === 'video') {
            const poster = el.getAttribute('poster');
            if (poster) {
              const clean = cleanUrlCandidate(poster);
              if (clean && !clean.startsWith('data:') && isExternalAssetUrl(clean, internalDomains)) {
                recordAsset(foundMap, clean, 'image');
              }
            }
          }
        }

        // C. 微信视频等 iframe (<iframe ...>)
        else if (tag === 'iframe') {
          const mpvid = el.getAttribute('data-mpvid') || el.getAttribute('data-src') || el.getAttribute('src');
          if (mpvid) {
            const clean = cleanUrlCandidate(mpvid);
            if (clean && isExternalAssetUrl(clean, internalDomains)) {
              recordAsset(foundMap, clean, 'video');
            }
          }
        }

        // D. SVG 矢量图片 (<image href="..." xlink:href="...">)
        else if (tag === 'image') {
          const href = el.getAttribute('href') || el.getAttribute('xlink:href') || el.getAttribute('data-src') || el.getAttribute('src');
          if (href) {
            const clean = cleanUrlCandidate(href);
            if (clean && !clean.startsWith('data:') && isExternalAssetUrl(clean, internalDomains)) {
              recordAsset(foundMap, clean, 'image');
            }
          }
        }

        // E. 链接 (<a href="...">)
        else if (tag === 'a') {
          const href = el.getAttribute('href');
          if (href) {
            const clean = cleanUrlCandidate(href);
            if (clean && isExternalAssetUrl(clean, internalDomains) && isMediaFileUrl(clean)) {
              recordAsset(foundMap, clean, detectAssetType(clean));
            }
          }
        }

        // F. 所有标签内联 style 中的 background-image / background: url(...)（135/秀米大量使用）
        const style = el.getAttribute('style');
        if (style && style.includes('url(')) {
          extractUrlsFromCss(style).forEach((cssUrl) => {
            if (isExternalAssetUrl(cssUrl, internalDomains)) {
              recordAsset(foundMap, cssUrl, 'image');
            }
          });
        }

        // G. 自定义背景图与懒加载属性（微信 SVG 动画常用 data-lazy-bgimg、data-background、data-bg）
        const lazyBg =
          el.getAttribute('data-lazy-bgimg') ||
          el.getAttribute('data-background') ||
          el.getAttribute('data-bg');
        if (lazyBg) {
          const clean = cleanUrlCandidate(lazyBg);
          if (
            clean &&
            !clean.startsWith('data:') &&
            isExternalAssetUrl(clean, internalDomains)
          ) {
            recordAsset(foundMap, clean, 'image');
          }
        }
      });
      domParsed = true;
    } catch (e) {
      console.warn('[app-editor] DOMParser 外链扫描异常，回退至正则引擎:', e);
    }
  }

  // 2. 正则引擎全方位兜底扫描：若 DOM 已解析成功则仅增量补漏（不重复累计计数）；若无 DOM 环境则全量计数
  runRegexExtraction(html, foundMap, internalDomains, domParsed);

  return Array.from(foundMap.values());
}

/**
 * 全局正则扫描兜底引擎
 */
function runRegexExtraction(html, foundMap, internalDomains, isFallback = false) {
  // 1. 全局匹配 CSS url(...)（覆盖内联 style 属性及 <style> 块）
  const cssUrlRegex = /url\(\s*(?:(['"]|&quot;|&#39;)(.*?)\1|([^\s)'"]+))\s*\)/gi;
  let match;
  while ((match = cssUrlRegex.exec(html)) !== null) {
    const raw = cleanUrlCandidate(match[2] || match[3] || '');
    if (raw && !raw.startsWith('data:') && isExternalAssetUrl(raw, internalDomains)) {
      recordAsset(foundMap, raw, 'image', isFallback);
    }
  }

  // 2. 匹配 <img ...> 标签内的所有常见图片 URL 属性
  const imgTagRegex = /<img\b([^>]*?)>/gi;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const attrsStr = match[1];
    const attrRegex = /\b(?:data-src|data-original|data-actualsrc|data-croporisrc|data-url|data-lazy-src|src)=["']?([^"'\s>]+)["']?/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      const raw = cleanUrlCandidate(attrMatch[1]);
      if (raw && !raw.startsWith('data:') && isExternalAssetUrl(raw, internalDomains)) {
        recordAsset(foundMap, raw, 'image', isFallback);
      }
    }
  }

  // 3. 匹配 <video|audio|source ...> 标签
  const mediaTagRegex = /<(?:video|audio|source)\b([^>]*?)>/gi;
  while ((match = mediaTagRegex.exec(html)) !== null) {
    const attrsStr = match[1];
    const isAudio = match[0].toLowerCase().startsWith('<audio');
    const attrRegex = /\b(?:src|data-src|data-url|poster)=["']?([^"'\s>]+)["']?/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      const isPoster = attrMatch[0].toLowerCase().startsWith('poster');
      const raw = cleanUrlCandidate(attrMatch[1]);
      if (raw && !raw.startsWith('data:') && isExternalAssetUrl(raw, internalDomains)) {
        if (isPoster) {
          recordAsset(foundMap, raw, 'image', isFallback);
        } else {
          recordAsset(foundMap, raw, isAudio ? 'audio' : isVideoUrl(raw) ? 'video' : 'media', isFallback);
        }
      }
    }
  }

  // 4. 匹配 <iframe ...> 标签中的视频
  const iframeRegex = /<iframe\b([^>]*?)>/gi;
  while ((match = iframeRegex.exec(html)) !== null) {
    const attrsStr = match[1];
    const attrRegex = /\b(?:data-mpvid|data-src|src)=["']?([^"'\s>]+)["']?/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      const raw = cleanUrlCandidate(attrMatch[1]);
      if (raw && isExternalAssetUrl(raw, internalDomains)) {
        recordAsset(foundMap, raw, 'video', isFallback);
      }
    }
  }

  // 5. 匹配 SVG <image ...>
  const svgImgRegex = /<image\b([^>]*?)>/gi;
  while ((match = svgImgRegex.exec(html)) !== null) {
    const attrsStr = match[1];
    const attrRegex = /\b(?:href|xlink:href|data-src|src)=["']?([^"'\s>]+)["']?/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      const raw = cleanUrlCandidate(attrMatch[1]);
      if (raw && !raw.startsWith('data:') && isExternalAssetUrl(raw, internalDomains)) {
        recordAsset(foundMap, raw, 'image', isFallback);
      }
    }
  }

  // 5.5 匹配 data-lazy-bgimg / data-background 自定义背景属性（微信 SVG 动画等）
  const dataBgRegex = /\b(?:data-lazy-bgimg|data-background|data-bg)=["']?([^"'\s>]+)["']?/gi;
  while ((match = dataBgRegex.exec(html)) !== null) {
    const raw = cleanUrlCandidate(match[1]);
    if (raw && !raw.startsWith('data:') && isExternalAssetUrl(raw, internalDomains)) {
      recordAsset(foundMap, raw, 'image', isFallback);
    }
  }

  // 6. 微信专属 CDN 域名超链接/属性扫网兜底（防止任何奇特排版标签包裹，保留完整 query 参数）
  const wechatCdnRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:qpic\.cn|qq\.com|weixin\.qq\.com)\/(?:&amp;|[^\s"'>\)\(\\])+/gi;
  while ((match = wechatCdnRegex.exec(html)) !== null) {
    let rawStr = match[0];
    if (rawStr.endsWith('&quot;')) rawStr = rawStr.slice(0, -6);
    if (rawStr.endsWith('&#39;')) rawStr = rawStr.slice(0, -5);
    const raw = cleanUrlCandidate(rawStr);
    if (raw && isExternalAssetUrl(raw, internalDomains)) {
      const isVideo = isVideoUrl(raw) || raw.includes('wxv_') || raw.includes('mpvideo');
      recordAsset(foundMap, raw, isVideo ? 'video' : 'image', isFallback);
    }
  }
}

export function checkUrlExpiration(url) {
  if (!url || typeof url !== 'string') return { isExpired: false, reason: '' };
  try {
    const fullUrl = url.startsWith('//')
      ? `http:${url}`
      : url.startsWith('http')
        ? url
        : `http://${url}`;
    const parsed = new URL(fullUrl);

    // 1. 微信 CDN dis_t 参数（dis_t 为签发时间戳，一般有效期至少 2 小时 = 7200 秒）
    const disT = parsed.searchParams.get('dis_t');
    if (disT && !isNaN(Number(disT))) {
      const expiryTimestamp = (Number(disT) + 7200) * 1000;
      if (expiryTimestamp < Date.now()) {
        const d = new Date(expiryTimestamp);
        const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return {
          isExpired: true,
          reason: `临时访问凭证已于 ${timeStr} 失效 (403)，建议从原页面重新获取或本地上传`,
        };
      }
    }

    // 2. 阿里云 OSS Expires 参数（绝对过期时间戳，秒）
    const ossExpires = parsed.searchParams.get('Expires');
    if (ossExpires && !isNaN(Number(ossExpires))) {
      const expiryTimestamp = Number(ossExpires) * 1000;
      if (expiryTimestamp < Date.now()) {
        const d = new Date(expiryTimestamp);
        const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return {
          isExpired: true,
          reason: `OSS 临时授权已于 ${timeStr} 过期`,
        };
      }
    }

    // 3. 腾讯云 COS q-sign-time 参数（格式: start;end）
    const cosSignTime = parsed.searchParams.get('q-sign-time');
    if (cosSignTime && cosSignTime.includes(';')) {
      const endSec = Number(cosSignTime.split(';')[1]);
      if (!isNaN(endSec) && endSec * 1000 < Date.now()) {
        const d = new Date(endSec * 1000);
        const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return {
          isExpired: true,
          reason: `COS 临时签名已于 ${timeStr} 过期`,
        };
      }
    }
  } catch {
    // 忽略异常
  }
  return { isExpired: false, reason: '' };
}

function recordAsset(map, rawUrl, type, isFallback = false) {
  const url = cleanUrlCandidate(rawUrl);
  if (!url) return;

  // 检查是否已存在完全相同或同源同路径的媒体资源（如微信同一图片在 data-lazy-bgimg 与 style background-image 中参数略微不同）
  for (const [existingUrl, existingItem] of map.entries()) {
    if (existingUrl === url || isSameMediaAsset(existingUrl, url)) {
      if (!isFallback) {
        existingItem.count += 1;
      }
      // 若当前 url 比已有 url 更完整（包含更多 query 参数），更新为更完整的有效 url
      if (url.length > existingUrl.length) {
        existingItem.url = url;
        existingItem.originalUrl = rawUrl ? rawUrl.trim() : url;
      }
      return;
    }
  }

  const expiration = checkUrlExpiration(url);
  const cleanName = getFileNameFromUrl(url);
  map.set(url, {
    id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url,
    originalUrl: rawUrl ? rawUrl.trim() : url,
    type,
    name: cleanName,
    count: 1,
    selected: !expiration.isExpired,
    isExpired: expiration.isExpired,
    status: expiration.isExpired ? 'error' : 'idle', // 'idle' | 'uploading' | 'success' | 'error'
    newUrl: '',
    errorMsg: expiration.reason,
  });
}

export function getFileNameFromUrl(url) {
  try {
    const pathname = new URL(url.startsWith('//') ? `http:${url}` : url).pathname;
    const base = pathname.split('/').pop() || 'external-asset';
    return decodeURIComponent(base).split('?')[0].split('#')[0] || 'external-asset';
  } catch {
    return 'external-asset';
  }
}

function isVideoUrl(url) {
  const ext = url.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv'].includes(ext);
}

function isMediaFileUrl(url) {
  const ext = url.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  return [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
    'mp4', 'webm', 'ogg', 'mov',
    'mp3', 'wav', 'aac',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip',
  ].includes(ext);
}

function detectAssetType(url) {
  const ext = url.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) {
    return 'audio';
  }
  return 'file';
}

/**
 * 替换正文中的外链资源 URL
 *
 * @param {string} html 正文
 * @param {Record<string, string>} urlMapping { [oldUrl]: newUrl }
 * @returns {string} 替换后的 HTML
 */
export function replaceAssetUrlsInHtml(html, urlMapping) {
  if (!html || !urlMapping || typeof html !== 'string') return html || '';
  let result = html;

  for (const [oldUrl, newUrl] of Object.entries(urlMapping)) {
    if (!oldUrl || !newUrl || oldUrl === newUrl) continue;

    const cleanOld = cleanUrlCandidate(oldUrl);

    // 1. 优先精准替换 CSS url(...)（支持各种引号与实体引号，防止遗留尾部 query 产生破损链接）
    const cssUrlRegex = /url\(\s*(['"]|&quot;|&#39;)?\s*(.*?)\s*\1\s*\)/gi;
    result = result.replace(cssUrlRegex, (match, quote, insideUrl) => {
      const q = quote || '';
      const cleanInside = cleanUrlCandidate(insideUrl);
      if (
        cleanInside === cleanOld ||
        insideUrl === oldUrl ||
        cleanInside === oldUrl ||
        insideUrl === cleanOld ||
        isSameMediaAsset(cleanInside, cleanOld)
      ) {
        return `url(${q}${newUrl}${q})`;
      }
      return match;
    });

    // 2. 精准替换常见媒体标签属性值 (src, data-src, data-lazy-bgimg, poster, href 等)
    const attrRegex = /\b(src|data-src|data-lazy-bgimg|data-original|data-actualsrc|data-croporisrc|poster|href)=(["'])(.*?)\2/gi;
    result = result.replace(attrRegex, (match, attrName, quote, attrVal) => {
      const cleanVal = cleanUrlCandidate(attrVal);
      if (
        cleanVal === cleanOld ||
        attrVal === oldUrl ||
        cleanVal === oldUrl ||
        attrVal === cleanOld ||
        isSameMediaAsset(cleanVal, cleanOld)
      ) {
        return `${attrName}=${quote}${newUrl}${quote}`;
      }
      return match;
    });

    // 3. 通用字符串精准候选替换（覆盖所有其他内联形态）
    const candidates = new Set([
      oldUrl,
      oldUrl.replace(/&/g, '&amp;'),
      oldUrl.replace(/&amp;/g, '&'),
      cleanOld,
      cleanOld.replace(/&/g, '&amp;'),
      decodeHtmlEntities(oldUrl),
      decodeHtmlEntities(oldUrl).replace(/&/g, '&amp;'),
    ]);

    for (const cand of candidates) {
      if (!cand) continue;
      const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), newUrl);
    }
  }

  return result;
}

/**
 * 转存单个外链资源入库并返回系统新 URL
 *
 * @param {string} url 原始外链
 * @param {Object} [options]
 * @param {Function} [options.uploadFileFn] 前端兜底上传函数
 * @param {number|string} [options.applicationId]
 * @returns {Promise<string>} 转存后的站内新 URL
 */
export async function transferRemoteAsset(url, options = {}) {
  const { uploadFileFn = null, applicationId = null, referer = null, refresh = false } = options;
  if (!url) throw new Error('缺少资源地址');

  const cleanUrl = decodeHtmlEntities(url);

  // 1. 优先调用后端服务端转存（服务端请求无浏览器 CORS 限制、直传 OSS/本地、秒级去重）
  try {
    const res = await requestClient.post('/uploads/transfer-url', {
      url: cleanUrl,
      application_id: applicationId || undefined,
      referer: referer || undefined,
      refresh: refresh ? true : undefined,
    });
    const retUrl = res?.url || res?.data?.url;
    if (retUrl) {
      return retUrl;
    }
  } catch (err) {
    const backendMessage =
      err?.response?.data?.message || err?.message || err?.error?.message;
    const status = err?.response?.status;
    // 若后端明确返回了业务异常（如 422 过期、500 服务端报错等），直接向用户暴露后端真实原因
    if (status && status !== 404) {
      throw new Error(backendMessage || '服务端转存失败');
    }
    console.warn('[app-editor] 后端转存接口不可用，尝试客户端直取:', err);
  }

  // 2. 仅在未配置后端接口 (404) 且传入了 uploadFileFn 时尝试客户端直取
  if (typeof uploadFileFn === 'function') {
    try {
      const resp = await fetch(cleanUrl, { mode: 'cors' });
      if (!resp.ok) {
        throw new Error(`资源下载失败 (HTTP ${resp.status})`);
      }
      const blob = await resp.blob();
      const filename = getFileNameFromUrl(cleanUrl);
      const file = new File([blob], filename, {
        type: blob.type || 'application/octet-stream',
      });
      const uploadedUrl = await uploadFileFn(file);
      if (uploadedUrl) {
        return uploadedUrl;
      }
    } catch (fetchErr) {
      throw new Error(`外链受跨域防盗链拦截 (CORS): ${fetchErr.message}`);
    }
  }

  throw new Error('外链资源转存失败');
}

/**
 * 解析来源文章（微信公众号或其他网页），提取标题、封面、正文及最新有效媒体映射
 *
 * @param {string} url 来源文章地址
 * @returns {Promise<{title: string, cover: string, videos: Array, vid_map: Record<string, string>, images: Array, content: string}>}
 */
export async function parseSourceArticle(url, options = {}) {
  if (!url) throw new Error('缺少来源网址');
  const refresh = typeof options === 'boolean' ? options : !!options?.refresh;
  const res = await requestClient.post('/uploads/parse-source', {
    url: decodeHtmlEntities(url.trim()),
    refresh: refresh ? true : undefined,
  });
  return res?.data || res;
}
