import { nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { useTabs } from '@vben/hooks';

import { message } from 'antdv-next';

import Resource from '#/api/resource';

import { buildApiUrl } from '../utils/api-url.js';

/**
 * OpenMode 解析（确定性映射）
 *
 * @param {string} requested - 请求的模式
 * @param {{ isNested?: boolean }} options
 * @returns {'modal'|'drawer'|'page'}
 */
export function resolveOpenMode(requested, { isNested } = {}) {
  let mode = requested;

  // 嵌套场景：page → drawer
  if (isNested && mode === 'page') {
    mode = 'drawer';
  }

  // 容错：非合法值 → modal
  if (!['drawer', 'modal', 'page'].includes(mode)) {
    mode = 'modal';
  }

  return mode;
}

/**
 * 详情视图管理 composable
 *
 * @param {object} props - 壳组件 props
 * @param {object} ctx - 上下文（emit 等）
 * @param {object} callbacks - { refresh, reload, formApi, routeApi, permissionApi }
 * @returns {object}
 */
export function useCrudTableDetail(props, ctx, callbacks) {
  const router = useRouter();
  const tabs = useTabs();

  // 创建 Modal / Drawer 容器
  const [ModalComponent, modalApi] = useVbenModal({
    draggable: true,
    async onCancel() {
      closeDetail('cancel');
    },
    async onOpenChange(isOpen) {
      if (!isOpen) {
        detailVisible.value = false;
      }
    },
  });

  const [DrawerComponent, drawerApi] = useVbenDrawer({
    async onCancel() {
      closeDetail('cancel');
    },
    async onOpenChange(isOpen) {
      if (!isOpen) {
        detailVisible.value = false;
      }
    },
  });

  // 详情状态
  const detailVisible = ref(false);
  const editing = ref(false);
  const loading = ref(false);
  const refreshing = ref(false);
  const saving = ref(false);
  const openType = ref('modal');

  // 审核相关
  const auditDialog = ref(false);
  const auditData = ref({ status: 1, reason: '' });
  const auditRow = ref(null);
  const auditSubmitting = ref(false);

  // 详情错误状态（page 模式）
  const detailError = ref(null);

  const { formApi, routeApi, reload: reloadList, modelValue } = callbacks;

  /**
   * 打开详情
   *
   * @param {string|number|null} id - 记录 ID（null 表示新增）
   * @param {boolean} [isEdit] - 是否编辑模式
   * @param {string} [tempOpenType] - 临时打开模式（优先使用）
   * @param {object} [rowData] - 行数据（来自列表），用于立即填充表单
   */
  async function openDetail(
    id,
    isEdit = true,
    tempOpenType = null,
    rowData = null,
  ) {
    // 解析 OpenMode
    const requested =
      tempOpenType ?? (id ? props.openMode?.detail : props.openMode?.create);
    const resolved = resolveOpenMode(requested, {
      isNested: routeApi?.isNested,
    });
    openType.value = resolved;

    editing.value = isEdit || id === null; // 新增时默认编辑
    detailError.value = null;

    ctx.emit('showDetail', editing.value);

    if (id === null) {
      // 新增：构建默认值
      modelValue.value = buildDefaultItem();
    } else if (rowData) {
      // 编辑/查看：优先用行数据填充，立即打开弹窗，后台加载详情更新
      modelValue.value = formApi.flattenDotFieldValues(rowData);
      await openOverlay(resolved, id, isEdit);
      // 后台加载详情并更新（用 refreshing 而非 loading，不阻塞表单显示）
      loadDetail(id, { silent: true }).catch(() => {});
      return;
    } else {
      // 编辑/查看：无行数据，等待加载详情后再打开
      const loadSuccess = await loadDetail(id);
      // 如果加载失败，不打开弹窗
      if (!loadSuccess) {
        return;
      }
    }

    // 按 OpenMode 分派
    await openOverlay(resolved, id, isEdit);
  }

  /**
   * 打开弹窗/抽屉/页面
   */
  async function openOverlay(resolved, id, isEdit) {
    if (resolved === 'page') {
      await routeApi.navigateToDetail(id, isEdit);
    } else if (resolved === 'drawer') {
      detailVisible.value = true;
      // 等待 drawer 组件挂载并注册 watcher 后再打开，
      // 否则首次打开时 isOpen 已为 true，watcher 不触发，内容不显示
      await nextTick();
      await drawerApi.open();
    } else {
      // modal
      detailVisible.value = true;
      await modalApi.open();
    }
  }

  /**
   * 关闭详情
   *
   * @param {'cancel'|'saved'} [reason]
   */
  async function closeDetail(reason = 'cancel') {
    ctx.emit('detailClose', reason);

    if (reason === 'cancel') {
      modelValue.value = {};
    }

    switch (openType.value) {
      case 'drawer': {
        await drawerApi.close();

        break;
      }
      case 'modal': {
        await modalApi.close();

        break;
      }
      case 'page': {
        await exitPageDetail(reason);

        break;
      }
      // No default
    }

    detailVisible.value = false;
    detailError.value = null;
  }

  /**
   * 加载详情
   * @param {string|number} id - 记录 ID
   * @param {{ silent?: boolean }} options - silent=true 时用 refreshing 替代 loading，不阻塞表单
   * @returns {boolean} 是否加载成功
   */
  async function loadDetail(id, { silent = false } = {}) {
    if (silent) {
      refreshing.value = true;
    } else {
      loading.value = true;
    }
    detailError.value = null;

    try {
      const url = buildApiUrl(
        { apiUrl: props.apiUrl, apiPrefix: props.apiPrefix },
        false,
      );
      const resource = new Resource(url);
      const response = await resource.get(id);

      let data = response?.data || response || {};

      // 应用 detailFormat
      if (typeof props.detailFormat === 'function') {
        data = props.detailFormat(data);
      }

      // 扁平化 dot 字段
      data = formApi.flattenDotFieldValues(data);

      modelValue.value = data;
      ctx.emit('update:modelValue', data);
      return true;
    } catch (error) {
      console.error('[AppCrudTable] loadDetail error:', error);

      if (openType.value === 'page') {
        detailError.value = error;
      } else {
        message.error('详情加载失败');
      }
      return false;
    } finally {
      if (silent) {
        refreshing.value = false;
      } else {
        loading.value = false;
      }
    }
  }

  /**
   * 提交表单
   */
  async function submit() {
    if (saving.value) return;

    // 1. 表单校验
    try {
      if (formApi.formRef.value) {
        await formApi.formRef.value.validate();
      }
    } catch {
      saving.value = false;
      message.error('表单有误');
      return;
    }

    saving.value = true;

    try {
      // 2. 文件上传前置
      await formApi.uploadPendingFiles();

      // 3. 还原 dot 字段
      let payload = formApi.expandDotKeys({ ...modelValue.value });

      // 4. saveFormat（返回 false 短路）
      if (typeof props.saveFormat === 'function') {
        const result = await props.saveFormat(payload);
        if (result === false) {
          saving.value = false;
          return;
        }
        payload = result;
      }

      // 5. 发起保存请求
      const isEdit = !!modelValue.value?.[props.idKey || 'id'];
      const url = buildApiUrl(
        { apiUrl: props.apiUrl, apiPrefix: props.apiPrefix },
        !isEdit,
      );
      const resource = new Resource(url);

      const savedData = await (isEdit
        ? resource.update(modelValue.value[props.idKey || 'id'], payload)
        : resource.store(payload));

      // 6. 保存成功
      ctx.emit('update:modelValue', savedData);
      ctx.emit('saved', savedData);
      ctx.emit('detailClose', 'saved');

      // 7. 刷新列表
      if (typeof reloadList === 'function') {
        reloadList();
      }

      // 8. 关闭详情
      switch (openType.value) {
        case 'drawer': {
          await drawerApi.close();

          break;
        }
        case 'modal': {
          await modalApi.close();

          break;
        }
        case 'page': {
          await exitPageDetail('saved');

          break;
        }
        // No default
      }

      detailVisible.value = false;
    } catch (error) {
      console.error('[AppCrudTable] submit error:', error);
      message.error(error?.message || '保存失败');
    } finally {
      saving.value = false;
    }
  }

  /**
   * 构建默认新增项
   */
  function buildDefaultItem(source) {
    const item = source || {};
    for (const f of props.fields || []) {
      if (f.field && item[f.field] === undefined) {
        item[f.field] = f.default === undefined ? undefined : f.default;
      }
    }
    return item;
  }

  /**
   * 删除记录
   */
  async function deleteItem(row) {
    try {
      const url = buildApiUrl(
        { apiUrl: props.apiUrl, apiPrefix: props.apiPrefix },
        false,
      );
      const resource = new Resource(url);
      await resource.destroy(row[props.idKey || 'id']);
      message.success('删除成功');
      if (typeof reloadList === 'function') {
        reloadList();
      }
    } catch (error) {
      console.error('[AppCrudTable] delete error:', error);
    }
  }

  /**
   * 审核
   */
  async function audit(row, status) {
    try {
      const url = buildApiUrl(
        { apiUrl: props.apiUrl, apiPrefix: props.apiPrefix },
        false,
      );
      const idKey = props.idKey || 'id';
      await new Resource(`${url}/${row[idKey]}/audit`).store({
        status,
        reason: '',
      });
      message.success('操作成功');
      if (typeof reloadList === 'function') {
        reloadList();
      }
    } catch (error) {
      console.error('[AppCrudTable] audit error:', error);
    }
  }

  /**
   * 打开审核弹窗
   */
  function openAuditDialog(row) {
    auditRow.value = row;
    auditData.value = { status: 1, reason: '' };
    auditDialog.value = true;
  }

  /**
   * 提交审核
   */
  async function submitAudit(data = auditData.value) {
    if (auditSubmitting.value) return;

    const { status, reason } = data;

    // 校验：不通过时 reason 必填
    if (status === 0 && (!reason || !reason.trim())) {
      message.error('请输入原因');
      return;
    }

    const row = auditRow.value;
    const idKey = props.idKey || 'id';
    if (!row || row[idKey] === undefined || row[idKey] === null) {
      message.error('审核对象不存在');
      return;
    }

    auditSubmitting.value = true;
    try {
      const url = buildApiUrl(
        { apiUrl: props.apiUrl, apiPrefix: props.apiPrefix },
        false,
      );
      await new Resource(`${url}/${row[idKey]}/audit`).store(data);

      auditDialog.value = false;
      auditData.value = { status: 1, reason: '' };
      auditRow.value = null;

      message.success('审核成功');
      if (typeof reloadList === 'function') {
        reloadList();
      }
    } catch (error) {
      console.error('[AppCrudTable] submitAudit error:', error);
      message.error(error?.message || '审核失败');
    } finally {
      auditSubmitting.value = false;
    }
  }

  /**
   * page 模式收尾
   */
  async function exitPageDetail(reason) {
    const listPath = routeApi?.listRoutePath?.value;

    if (reason === 'saved' && listPath) {
      await router.replace(listPath);
      tabs.closeCurrentTab();
      return;
    }

    // 取消或 listPath 无法解析
    if (router.options?.history?.state?.back) {
      router.back();
    } else {
      await router.push('/');
    }
    tabs.closeCurrentTab();
  }

  /**
   * 返回列表（page 模式下详情加载失败时使用）
   */
  async function navigateToList() {
    await routeApi?.navigateToList?.();
  }

  return {
    ModalComponent,
    DrawerComponent,
    modalApi,
    drawerApi,
    detailVisible,
    editing,
    loading,
    refreshing,
    saving,
    openType,
    resolveOpenMode,
    openDetail,
    closeDetail,
    loadDetail,
    submit,
    buildDefaultItem,
    audit,
    openAuditDialog,
    auditDialog,
    auditData,
    auditRow,
    auditSubmitting,
    submitAudit,
    deleteItem,
    detailError,
    navigateToList,
  };
}
