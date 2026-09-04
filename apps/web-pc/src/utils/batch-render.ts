/**
 * 批量渲染 + 本地合并/导出（任务记录 / 监理日志列表共用）。
 *
 * 批量打印：分批请求拉取渲染载荷（template_base64 + render_data）→ 本地 WASM 渲染 →
 * 本地 docx 合并为单文件（每份之间分页）→ 交给 SubmissionPreviewDrawer 预览；
 * 预览内切换「显示签名」时通过 reRender 回调重新渲染并合并整批
 * （载荷已缓存，切换只重渲染、不再发远程请求）。
 * 批量导出：渲染为独立 docx，按「记录人姓名-日期-日志类型-编号」命名。
 * 输出只有一层压缩包（不再每条记录各自打包后再套外层 zip）：
 * - 只导出一条只有 docx 的记录：直接下载该 docx，不压缩；
 * - 其余：一个 zip，单文件记录平铺在根目录，带附件的记录按记录名建文件夹。
 */
import { ref } from 'vue';

import { message } from 'antdv-next';

import Resource from '#/api/resource';
import { mergeDocxBlobs } from '#/utils/docx-merge';
import {
  downloadBlob,
  fetchFileBytes,
  renderSubmissionPayload,
  safeFileName,
  uniqueFileName,
  zipFiles,
} from '#/utils/render-docx';

/**
 * 单批拉取条数：后端已将重复查询在本次请求内合并，并对渲染载荷做了 600s 缓存，
 * 因此常规选择（≤200 条）走一次性请求即可；分批仅作为超过后端上限时的兜底拆分。
 * 后端 batch-render 接口单次上限 200，这里保持一致，使单批不会被后端拒绝。
 */
const BATCH_SIZE = 200;
/** 同时进行的批次数：超过 BATCH_SIZE 时兼顾速度与后端压力 */
const BATCH_CONCURRENCY = 2;
/** 拉取渲染载荷的超时：后端逐条组装渲染数据，远慢于普通列表接口（默认 10s 不够） */
const RENDER_TIMEOUT = 60_000;
const SINGLE_TIMEOUT = 60_000;

/** 记录人/日期/类型(code)兜底用字段 */
interface SubmissionPayload {
  code?: string;
  date?: string;
  executor?: null | { name?: string };
  form?: null | { name?: string };
  form_id?: null | number | string;
  render_data?: null | Record<string, unknown>;
  template_base64?: string;
  /** 模板按内容去重下发后的引用键（配合响应顶层 templates 使用） */
  template_key?: string;
  attachments?: Array<{
    name?: string;
    url?: string;
  }>;
  user?: null | { name?: string };
  [key: string]: unknown;
}

export interface BatchRenderRow {
  date?: string;
  form?: null | { name?: string };
  id: null | number | string;
  submission?: null | { code?: string; state?: number };
  submission_id?: null | number;
  [key: string]: unknown;
}

/** 导出文件名规则；返回空串时回退为 记录_{id} */
export type DocNameFn = (
  row: BatchRenderRow,
  payload: SubmissionPayload,
) => Promise<string> | string;

const formNameCache = new Map<number, string>();
let formListPromise: null | Promise<Map<number, string>> = null;

/** 按 form_id 取表单名（懒加载一次 forms 全量列表并缓存）；失败返回空串 */
export async function formNameById(
  id: null | number | string | undefined,
): Promise<string> {
  if (id === null || id === undefined || id === '') {
    return '';
  }
  if (formNameCache.has(Number(id))) {
    return formNameCache.get(Number(id)) ?? '';
  }
  if (!formListPromise) {
    formListPromise = new Resource('forms')
      .list({ per_page: 'all' })
      .then(({ data }) => {
        const map = new Map<number, string>();
        const items = Array.isArray(data) ? data : data?.items || [];
        for (const form of items) {
          if (form?.id && form?.name) {
            map.set(Number(form.id), String(form.name));
          }
        }
        return map;
      })
      .catch((error) => {
        console.warn('表单列表拉取失败:', error);
        return new Map<number, string>();
      });
  }
  const map = await formListPromise;
  const name = map.get(Number(id));
  if (name) {
    formNameCache.set(Number(id), name);
  }
  return name || '';
}

export function useBatchRender(options: {
  /** 导出单文档文件名规则（默认 fallback） */
  docName?: DocNameFn;
  /** 拉取渲染载荷用的资源名：task-submissions / supervision-logs（仅批量接口失败时逐条回退） */
  resourceName: string;
}) {
  const { resourceName, docName } = options;
  const batching = ref(false);
  const withSignature = ref(false);
  /** 渲染载荷缓存：key 为 submission_id；签名切换只重渲染、不再请求 */
  const payloadCache = new Map<string, SubmissionPayload>();

  async function loadPayload(row: BatchRenderRow) {
    const { data } = await new Resource(resourceName, {
      timeout: SINGLE_TIMEOUT,
    }).get(String(row.id));
    // task-submissions.show 顶层即 submission；supervision-logs.show 嵌套在 submission
    return data?.submission && typeof data.submission === 'object'
      ? data.submission
      : data || {};
  }

  /** 载荷 key：优先 submission_id（批量接口按 submission 维度下发） */
  function payloadKey(row: BatchRenderRow): string {
    return String(row.submission_id ?? row.id);
  }

  /**
   * 拉取一批（BATCH_SIZE 条）渲染载荷并写入缓存。
   * 模板按内容去重下发（顶层 templates），这里按 template_key 回填成渲染所需的
   * template_base64；老格式（条目自带 template_base64）不覆盖，保持兼容。
   */
  async function loadPayloadChunk(
    keys: string[],
    rowByKey: Map<string, BatchRenderRow | undefined>,
  ): Promise<void> {
    try {
      const { data, templates } = await new Resource('submission', {
        timeout: RENDER_TIMEOUT,
      }).get('batch-render', { list: keys });
      const entries = data && typeof data === 'object' ? data : {};
      const templateMap =
        templates && typeof templates === 'object' ? templates : {};
      for (const key of keys) {
        const entry = entries[key];
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const payload = entry as SubmissionPayload;
        const fromTemplates =
          payload.template_key && templateMap[payload.template_key];
        if (fromTemplates) {
          payload.template_base64 = String(fromTemplates);
        }
        payloadCache.set(key, payload);
      }
    } catch (error) {
      console.warn('批量拉取渲染载荷失败，逐条回退:', error);
    }
    for (const key of keys) {
      if (payloadCache.has(key)) {
        continue;
      }
      const row = rowByKey.get(key);
      if (!row) {
        continue;
      }
      try {
        payloadCache.set(key, await loadPayload(row));
      } catch (error) {
        console.warn(`记录 #${row.id} 载荷获取失败，跳过:`, error);
      }
    }
  }

  /**
   * 批量拉取渲染载荷：按 BATCH_SIZE 拆成多批（并发 BATCH_CONCURRENCY 批）取回缺失的
   * submission 载荷并写入缓存；批量接口失败或缺失的记录再逐条回退。
   * 一次性请求全部记录会因后端逐条组装 + 响应体过大而超时，故必须分批。
   */
  async function loadBatchPayloads(rows: BatchRenderRow[]): Promise<void> {
    const missingKeys = [
      ...new Set(
        rows.map((row) => payloadKey(row)).filter((key) => !payloadCache.has(key)),
      ),
    ];
    if (missingKeys.length === 0) {
      return;
    }
    const rowByKey = new Map<string, BatchRenderRow | undefined>(
      missingKeys.map((key) => [
        key,
        rows.find((row) => payloadKey(row) === key),
      ]),
    );
    const chunks: string[][] = [];
    for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
      chunks.push(missingKeys.slice(i, i + BATCH_SIZE));
    }
    // 记录较多（或分批）时给个进度提示，避免长时间点击无反馈
    const showProgress = missingKeys.length > 10;
    if (showProgress) {
      message.loading(
        `正在加载渲染数据（共 ${missingKeys.length} 条${chunks.length > 1 ? `，分 ${chunks.length} 批` : ''}）...`,
        0,
      );
    }
    try {
      for (let i = 0; i < chunks.length; i += BATCH_CONCURRENCY) {
        await Promise.all(
          chunks
            .slice(i, i + BATCH_CONCURRENCY)
            .map((keys) => loadPayloadChunk(keys, rowByKey)),
        );
      }
    } finally {
      if (showProgress) {
        message.destroy();
      }
    }
  }

  /** 按行取缓存载荷（未取到返回空，由调用方跳过） */
  function cachedPayload(row: BatchRenderRow): SubmissionPayload {
    return payloadCache.get(payloadKey(row)) || {};
  }

  /**
   * 逐条渲染并合并为一个 docx Blob。
   * @param signature 是否包含签名（切换时重新合并传入新值）
   */
  async function buildMerged(
    rows: BatchRenderRow[],
    signature: boolean = withSignature.value,
  ): Promise<Blob> {
    if (rows.length === 0) {
      throw new Error('请至少选择一条已提交的记录');
    }
    await loadBatchPayloads(rows);
    const blobs: Blob[] = [];
    let skipped = 0;
    for (const row of rows) {
      try {
        const payload = cachedPayload(row);
        if (!payload.template_base64 || !payload.render_data) {
          skipped += 1;
          continue;
        }
        blobs.push(
          await renderSubmissionPayload(
            payload.template_base64,
            payload.render_data,
            {
              withSignature: signature,
            },
          ),
        );
      } catch (error) {
        console.warn(`记录 #${row.id} 渲染失败，跳过:`, error);
        skipped += 1;
      }
    }
    if (blobs.length === 0) {
      throw new Error('所选记录均无打印模板或渲染失败');
    }
    if (skipped > 0) {
      message.warning(`有 ${skipped} 条记录无打印模板或渲染失败，已跳过`);
    }
    return mergeDocxBlobs(blobs);
  }

  /** 批量打印：合并后交给 SubmissionPreviewDrawer 本地预览，预览内可切签名并重渲染整批 */
  async function batchPrint(
    rows: BatchRenderRow[],
    previewRef: null | { open: (submission: object) => void },
  ) {
    if (rows.length === 0) {
      message.warning('请至少选择一条已提交的记录');
      return;
    }
    batching.value = true;
    try {
      const blob = await buildMerged(rows, withSignature.value);
      const title = `合并文档_${Date.now()}.docx`;
      if (previewRef) {
        previewRef.open({
          blob,
          buffer: await blob.arrayBuffer(),
          key: `merge-${Date.now()}`,
          showSignature: withSignature.value,
          title,
          reRender: async (signature: boolean) => {
            const nextBlob = await buildMerged(rows, signature);
            return { blob: nextBlob, buffer: await nextBlob.arrayBuffer() };
          },
        });
      } else {
        downloadBlob(blob, title);
      }
    } catch (error) {
      console.error('批量打印失败:', error);
      message.error((error as Error)?.message || '批量打印失败');
    } finally {
      batching.value = false;
    }
  }

  /**
   * 批量导出：按记录渲染 docx + 下载附件，只输出一层压缩包。
   * - 只导出一条记录且该记录只有 docx（无附件）：直接下载 docx，不压缩；
   * - 其余情况：一个 zip；记录只有单个文件时直接平铺在根目录，
   *   记录带附件（多文件）时才以「记录名」建文件夹组织 docx 与附件。
   */
  async function batchExport(rows: BatchRenderRow[]) {
    if (rows.length === 0) {
      message.warning('请至少选择一条已提交的记录');
      return;
    }
    batching.value = true;
    try {
      await loadBatchPayloads(rows);
      /** 每条记录：文件夹名 + 该文件夹下的文件（docx + 附件） */
      const records: Array<{
        files: Record<string, Uint8Array>;
        folder: string;
      }> = [];
      const usedFolders = new Set<string>();
      let skipped = 0;
      for (const row of rows) {
        try {
          const payload = cachedPayload(row);
          if (!payload.template_base64 || !payload.render_data) {
            skipped += 1;
            continue;
          }
          const blob = await renderSubmissionPayload(
            payload.template_base64,
            payload.render_data,
            { withSignature: withSignature.value },
          );
          // 文件夹名（同时作为 docx 主文件名），重名自动加序号
          const base = safeFileName(
            ((docName ? await docName(row, payload) : '') || `记录_${row.id}`)
              .replaceAll(/\s+/g, '')
              .slice(0, 80),
            `记录_${row.id}`,
          );
          let folder = base;
          let index = 2;
          while (usedFolders.has(folder)) {
            folder = `${base}(${index})`;
            index += 1;
          }
          usedFolders.add(folder);
          const docxName = `${folder}.docx`;
          const files: Record<string, Uint8Array> = {
            [docxName]: new Uint8Array(await blob.arrayBuffer()),
          };
          const usedNames = new Set(Object.keys(files));
          for (const attachment of payload.attachments || []) {
            if (!attachment?.url) continue;
            try {
              const attachmentName = uniqueFileName(
                attachment.name || '附件',
                usedNames,
              );
              files[attachmentName] = await fetchFileBytes(attachment.url);
            } catch (error) {
              console.warn(`记录 #${row.id} 附件下载失败，跳过:`, error);
            }
          }
          records.push({ files, folder });
        } catch (error) {
          console.warn(`记录 #${row.id} 渲染失败，跳过:`, error);
          skipped += 1;
        }
      }
      if (records.length === 0) {
        throw new Error('所选记录均无打印模板或渲染失败');
      }
      if (skipped > 0) {
        message.warning(`有 ${skipped} 条记录无打印模板或渲染失败，已跳过`);
      }

      // 单条记录且只有一个 docx（无附件）：直接下载，不再打包
      if (records.length === 1) {
        const entries = Object.entries(records[0]!.files);
        if (entries.length === 1) {
          const [name, bytes] = entries[0]!;
          downloadBlob(
            new Blob([bytes.slice()], {
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            name,
          );
          message.success('导出成功');
          return;
        }
      }

      // 单层 zip：只有「docx + 附件」多文件的记录才建文件夹，单文件记录直接平铺到根目录
      const zipEntries: Record<
        string,
        Record<string, Uint8Array> | Uint8Array
      > = {};
      for (const { files, folder } of records) {
        const entries = Object.entries(files);
        if (entries.length === 1) {
          zipEntries[entries[0]![0]] = entries[0]![1];
        } else {
          zipEntries[folder] = files;
        }
      }
      downloadBlob(zipFiles(zipEntries), `批量导出_${Date.now()}.zip`);
      message.success('导出成功');
    } catch (error) {
      console.error('批量导出失败:', error);
      message.error((error as Error)?.message || '批量导出失败');
    } finally {
      batching.value = false;
    }
  }

  return { batching, withSignature, batchPrint, batchExport };
}
