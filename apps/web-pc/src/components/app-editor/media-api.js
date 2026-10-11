import { requestClient } from '#/api/request';

export const MEDIA_TYPE_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '文档', value: 'document' },
  { label: '音频', value: 'audio' },
];

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
export const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];

/**
 * 默认图片缩略图处理参数（当前采用阿里云 OSS 规则：等比缩放至宽400、质量80、WebP格式）
 * 作为独立变量导出，后续更换其他云存储（如腾讯云 COS、七牛云或自建规则）时可直接修改或通过组件 prop 传入覆盖
 */
export const DEFAULT_THUMBNAIL_PROCESS =
  'x-oss-process=image/resize,w_400/quality,q_80/format,webp';

export function formatBytes(bytes) {
  const num = Number(bytes);
  if (!num || Number.isNaN(num) || num <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = num;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function detectMediaType(mime = '', ext = '') {
  const m = (mime || '').toLowerCase();
  const e = (ext || '').toLowerCase();
  if (m.startsWith('image/') || IMAGE_EXTENSIONS.includes(e)) {
    return 'image';
  }
  if (m.startsWith('video/') || VIDEO_EXTENSIONS.includes(e)) {
    return 'video';
  }
  if (m.startsWith('audio/') || AUDIO_EXTENSIONS.includes(e)) {
    return 'audio';
  }
  if (
    m.includes('pdf') ||
    m.includes('word') ||
    m.includes('excel') ||
    m.includes('powerpoint') ||
    m.includes('officedocument') ||
    m.startsWith('text/') ||
    DOC_EXTENSIONS.includes(e)
  ) {
    return 'document';
  }
  return 'other';
}

/**
 * 构建用于媒体库预览的缩略图 URL（预览使用压缩缩略图，大幅提升加载速度与节省带宽）
 *
 * @param {string} url 原始图片 URL
 * @param {string|Function|boolean} [processRule=DEFAULT_THUMBNAIL_PROCESS] 缩略图处理参数或构建函数
 * @param {Object} [item] 媒体对象
 * @returns {string} 缩略图 URL
 */
export function buildThumbnailUrl(
  url,
  processRule = DEFAULT_THUMBNAIL_PROCESS,
  item = null,
) {
  if (!url || typeof url !== 'string') return url || '';
  if (processRule === false || processRule === null) return url;

  // 自定义函数转换
  if (typeof processRule === 'function') {
    return processRule(url, item) || url;
  }

  const cleanUrl = url.trim();
  const lower = cleanUrl.toLowerCase();
  // SVG 矢量图或图标通常不经过位图裁剪压缩
  if (lower.includes('.svg') || lower.includes('.ico')) {
    return cleanUrl;
  }

  // 清洗传入的规则字符串（去除开头的 ? 或 &）
  const rule = String(processRule).trim().replace(/^[?&]+/, '');
  if (!rule) return cleanUrl;

  // 如果 URL 已经包含该参数，避免重复拼接
  if (cleanUrl.includes(rule)) {
    return cleanUrl;
  }

  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}${rule}`;
}

/**
 * 剥离图片 URL 中的缩略图/处理参数，确保插入编辑器的是纯净原图
 *
 * @param {string} url
 * @returns {string} 纯净原图 URL
 */
export function stripThumbnailParam(url) {
  if (!url || typeof url !== 'string') return url || '';
  try {
    const isAbsolute =
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('//');
    const parsed = new URL(url, 'http://localhost');
    let modified = false;

    const keysToDelete = [];
    for (const key of parsed.searchParams.keys()) {
      if (
        key === 'x-oss-process' ||
        key.startsWith('imageMogr2') ||
        key.startsWith('imageView2')
      ) {
        keysToDelete.push(key);
      }
    }

    for (const k of keysToDelete) {
      parsed.searchParams.delete(k);
      modified = true;
    }

    if (modified) {
      const search = parsed.search ? parsed.search : '';
      const hash = parsed.hash || '';
      if (!isAbsolute) {
        return parsed.pathname + search + hash;
      }
      return (
        (url.startsWith('//') ? '//' + parsed.host : parsed.origin) +
        parsed.pathname +
        search +
        hash
      );
    }
  } catch {
    // 降级正则清洗
  }

  return url
    .replace(/[?&]x-oss-process=[^&#]*/gi, '')
    .replace(/[?&]imageMogr2\/[^&#]*/gi, '')
    .replace(/[?&]imageView2\/[^&#]*/gi, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
}

/**
 * 预置本系统媒体库获取接口：请求 GET /uploads 并按类型筛选与分页
 *
 * @param {Object} params
 * @param {'image'|'video'|'document'|'audio'|'all'} [params.type='all'] 媒体类型
 * @param {string} [params.keyword=''] 关键字搜索
 * @param {number} [params.page=1] 页码
 * @param {number} [params.pageSize=30] 每页条数
 * @param {number|string} [params.applicationId] 应用 ID 过滤
 * @param {string|Function|boolean} [params.thumbnailProcess] 缩略图处理参数
 * @returns {Promise<{ items: Array, total: number, page: number, pageSize: number }>}
 */
export async function defaultFetchMedia(params = {}) {
  const {
    type = 'all',
    keyword = '',
    page = 1,
    pageSize = 30,
    applicationId = null,
    thumbnailProcess = DEFAULT_THUMBNAIL_PROCESS,
  } = params;

  try {
    const res = await (requestClient.get
      ? requestClient.get('/uploads', {
          params: {
            keyword: keyword || undefined,
            application_id: applicationId || undefined,
            type: type && type !== 'all' ? type : undefined,
            per_page: pageSize,
            page,
          },
          responseReturn: 'body',
        })
      : requestClient.request('/uploads', {
          method: 'get',
          params: {
            keyword: keyword || undefined,
            application_id: applicationId || undefined,
            type: type && type !== 'all' ? type : undefined,
            per_page: pageSize,
            page,
          },
          responseReturn: 'body',
        }));

    let rawList = [];
    let total = 0;

    if (res && res.data && Array.isArray(res.data)) {
      rawList = res.data;
      total = Number(res.meta?.total ?? res.data.length);
    } else if (res && Array.isArray(res.items)) {
      rawList = res.items;
      total = Number(res.total ?? res.items.length);
    } else if (Array.isArray(res)) {
      rawList = res;
      total = res.length;
    }

    // 后端已按 type 过滤；前端做一层兜底保障纯净度
    const filtered = rawList.filter((item) => {
      if (!type || type === 'all') return true;
      const mime = (item.mime || '').toLowerCase();
      const ext = (item.extension || item.name?.split('.').pop() || '').toLowerCase();

      if (type === 'image') {
        return mime.startsWith('image/') || IMAGE_EXTENSIONS.includes(ext);
      }
      if (type === 'video') {
        return mime.startsWith('video/') || VIDEO_EXTENSIONS.includes(ext);
      }
      if (type === 'audio') {
        return mime.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext);
      }
      if (type === 'document') {
        return (
          mime.includes('pdf') ||
          mime.includes('word') ||
          mime.includes('excel') ||
          mime.includes('powerpoint') ||
          mime.includes('officedocument') ||
          mime.startsWith('text/') ||
          DOC_EXTENSIONS.includes(ext)
        );
      }
      return true;
    });

    // 格式化输出标准化对象：url 保存原图（用于插入编辑器），thumbnailUrl 保存缩略图（用于媒体库网格预览）
    const items = filtered.map((item) => {
      const ext = (item.extension || item.name?.split('.').pop() || '').toLowerCase();
      const mediaType = detectMediaType(item.mime, ext);
      const isImage = mediaType === 'image';
      const cleanUrl = stripThumbnailParam(item.url || '');
      const thumb = isImage
        ? buildThumbnailUrl(cleanUrl, thumbnailProcess, item)
        : cleanUrl;

      return {
        id: item.id,
        name: item.name || '未命名文件',
        url: cleanUrl, // 原图 URL，插入编辑器使用
        thumbnailUrl: thumb, // 缩略图 URL，列表预览使用
        size: item.size || 0,
        sizeHuman: formatBytes(item.size),
        mime: item.mime || '',
        extension: ext,
        type: mediaType,
        created_at: item.created_at || '',
      };
    });

    return {
      items,
      total: total || items.length,
      page,
      pageSize,
    };
  } catch (error) {
    console.warn('[app-editor] 媒体库获取失败，回退为空列表:', error);
    return {
      items: [],
      total: 0,
      page,
      pageSize,
    };
  }
}
