import { computed, ref } from 'vue';

import { expandDotKeys, flattenDotFieldValues } from '../utils/dot-keys.js';

/**
 * 元信息时间戳字段（在底部操作容器展示）。
 * 与 CrudRecordMeta 的底部展示字段保持一致。
 */
const META_TIMESTAMP_FIELDS = ['created_at', 'updated_at'];

/**
 * 表单字段格式化与 dot-key 管理 composable
 *
 * @param {object} props - 壳组件 props
 * @param {object} ctx - 上下文（emit 等）
 * @param {import('vue').Ref<object>} modelValueRef - 当前编辑行数据
 * @returns {{
 *   formRef: import('vue').Ref,
 *   formatedFields: import('vue').ComputedRef<Array>,
 *   fieldRefMap: import('vue').Ref<Object>,
 *   setFieldRef: (renderKey: string, el: any) => void,
 *   getFieldRenderKey: (field: Object, index: number) => string,
 *   flattenDotFieldValues: (data: Object) => Object,
 *   expandDotKeys: (data: Object) => Object,
 *   reset: () => Promise<void>,
 *   validateMessages: Object,
 *   uploadPendingFiles: () => Promise<void>,
 *   dotFieldNames: import('vue').ComputedRef<string[]>,
 * }}
 */
export function useCrudTableForm(props, ctx, modelValueRef) {
  const formRef = ref(null);

  // 字段引用映射（用于获取 AppField 实例）
  const fieldRefMap = ref({});

  // 计算声明的 dot 字段名列表
  const dotFieldNames = computed(() => {
    return (props.fields || [])
      .map((f) => f.field)
      .filter((f) => f && f.includes('.'));
  });

  /**
   * 元信息布局编排
   *
   * ID（编辑/查看时）在详情标题区展示，created_at / updated_at 在底部操作
   * 按钮容器左侧展示；主体表单不再重复渲染声明为 displayOnly 的这些字段。
   * 声明为可编辑的同名字段（如自填时间）不受影响，仍留在表单体。
   *
   * @param {Array} list - 经过 exclude/fieldFormat/renderKey 处理后的字段列表
   */
  function withMetaLayout(list) {
    const idKey = props.idKey || 'id';
    const metaNames = new Set([idKey, ...META_TIMESTAMP_FIELDS]);
    return list.filter((f) => !(metaNames.has(f.field) && f.displayOnly));
  }

  /**
   * 格式化后的字段列表（含元信息布局编排）
   * - 通过 excludeFields 过滤
   * - 通过 fieldFormat 再加工（返回 false 跳过）
   * - displayOnly 的 ID / created_at / updated_at 移出表单体（见 withMetaLayout）
   * - 为循环渲染生成稳定 renderKey
   */
  const formatedFields = computed(() => {
    const excludeSet = new Set(props.excludeFields || []);
    const editing =
      modelValueRef.value?.[props.idKey || 'id'] !== undefined;

    const list = (props.fields || [])
      .filter((f) => !excludeSet.has(f.field))
      .map((f) => {
        if (typeof props.fieldFormat === 'function') {
          const result = props.fieldFormat(
            f,
            editing ? modelValueRef.value : null,
          );
          if (result === false) return null;
          return result || f;
        }
        return f;
      })
      .filter(Boolean)
      .map((f, index) => ({
        ...f,
        renderKey: getFieldRenderKey(f, index),
      }));

    return withMetaLayout(list);
  });

  /**
   * 为字段生成稳定渲染 key
   */
  function getFieldRenderKey(field, index) {
    return `${field.field || '_empty'}_${index}`;
  }

  /**
   * 设置字段 ref
   */
  function setFieldRef(renderKey, el) {
    if (el) {
      fieldRefMap.value[renderKey] = el;
    } else {
      delete fieldRefMap.value[renderKey];
    }
  }

  /**
   * 扁平化 dot 字段值
   */
  function flattenDotFieldValuesFn(data) {
    return flattenDotFieldValues(data, dotFieldNames.value);
  }

  /**
   * 还原 dot 字段为嵌套结构
   */
  function expandDotKeysFn(data) {
    return expandDotKeys(data);
  }

  /**
   * 重置表单
   */
  async function reset() {
    if (formRef.value) {
      formRef.value.resetFields();
    }
  }

  /**
   * 统一校验消息
   */
  const validateMessages = {
    required: '${label}不能为空',
  };

  /**
   * 上传待处理的文件
   * 遍历 AppUpload 支持的字段类型（file/files/image/images/video/videos/audio，
   * AppField 均映射到 AppUpload），对 url 不以 'http' 开头的子项调用 AppField.upload()
   *
   * 白名单必须与 AppField 的上传分支保持同步：漏掉某个类型时该字段的新增文件
   * 会被静默跳过（保存成功但文件没传上去，且没有任何报错）。
   */
  async function uploadPendingFiles() {
    const fields = formatedFields.value.filter((f) =>
      [
        'file',
        'files',
        'image',
        'images',
        'video',
        'videos',
        'audio',
      ].includes(f.type),
    );

    for (const field of fields) {
      const ref = fieldRefMap.value[field.renderKey];

      if (ref && typeof ref?.fieldRef?.upload === 'function') {
        const values = modelValueRef.value?.[field.field];
        const arr = Array.isArray(values) ? values : [values];

        const hasPending = arr.some(
          (v) => v && v.url && !v.url.startsWith('http'),
        );
        if (hasPending) {
          await ref.fieldRef.upload();
        }
      }
    }
  }

  return {
    formRef,
    formatedFields,
    fieldRefMap,
    setFieldRef,
    getFieldRenderKey,
    flattenDotFieldValues: flattenDotFieldValuesFn,
    expandDotKeys: expandDotKeysFn,
    reset,
    validateMessages,
    uploadPendingFiles,
    dotFieldNames,
  };
}
