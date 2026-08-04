import { computed, ref, watch } from 'vue';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';

/**
 * 计划(plan)/任务(task)共用：表单远程选项加载、工序→监理方式联动、
 * 详情回显/保存转换（executors/mileposts id 数组 ↔ [{id}]、时间字段拆分/合并）
 *
 * @param {Object} options
 * @param {import('vue').Ref} options.editingItem - 表单模型 v-model 绑定对象
 * @param {'separate'|'combined'} options.timeMode - separate: 起止日期(日)+起止时间(plan)；
 *                                                   combined: 起止时间 datetime 区间(task)
 */
export function useTaskFormLoader({ editingItem, timeMode = 'separate' }) {
  const appStore = useAppStore();
  const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);

  const stakeholders = ref([]);
  const divisions = ref([]);
  const procedures = ref([]);
  const measures = ref([]);
  const procedureForms = ref({});
  const executors = ref([]);
  const mileposts = ref([]);
  const projectCategories = ref([]);

  const formFields = ref([]);

  function buildFormFields() {
    const timeFields =
      timeMode === 'combined'
        ? [{ field: 'start_end_time', type: 'slot', span: 12, label: '起止时间' }]
        : [
            { field: 'start_end_time', type: 'slot', span: 12, label: '起止日期' },
            { field: 'start_time', type: 'time', span: 6, label: '开始时间', required: true },
            { field: 'end_time', type: 'time', span: 6, label: '结束时间', required: true },
          ];
    formFields.value = [
      ...timeFields,
      { field: 'stakeholder_id', type: 'select', span: 8, label: '相关单位', attrs: { options: [] } },
      { field: 'unit_project_id', type: 'tree-select', span: 8, label: '单位工程', required: true, attrs: { options: [] } },
      { field: 'procedure_id', type: 'select', span: 8, label: '工序', required: true, attrs: { options: [] } },
      { field: 'measure_id', type: 'select', span: 8, label: '监理方式', required: true, attrs: { options: [] } },
      { field: 'executors', type: 'select', span: 16, label: '执行人', required: true, attrs: { options: [], multiple: true } },
      { field: 'mileposts', type: 'select', span: 16, label: '桩号/地点', required: true, attrs: { options: [], multiple: true } },
      { field: 'content', type: 'textarea', span: 24, label: '任务内容' },
      { field: 'form', type: 'slot', span: 24, label: '任务表单' },
    ];
  }

  function buildTree(list) {
    const map = {};
    const roots = [];
    list.forEach((n) => {
      map[n.id] = { ...n, children: [] };
    });
    list.forEach((n) => {
      if (n.parent_id && map[n.parent_id]) map[n.parent_id].children.push(map[n.id]);
      else roots.push(map[n.id]);
    });
    return roots;
  }

  function setOptions(field, options) {
    const f = formFields.value.find((x) => x.field === field);
    if (f) f.attrs.options = options;
  }

  async function loadStakeholders() {
    const { data } = await new Resource('stakeholders').list({
      project_id: currentProjectId.value,
      per_page: 'all',
    });
    stakeholders.value = data || [];
    setOptions('stakeholder_id', stakeholders.value);
  }

  async function loadDivisions() {
    const { data } = await new Resource('divisions').list({
      project_id: currentProjectId.value,
      levels: [1, 2],
      per_page: 'all',
    });
    divisions.value = buildTree(data || []);
    setOptions('unit_project_id', divisions.value);
  }

  async function loadProcedures() {
    const { data } = await new Resource('procedures').list({
      categories: projectCategories.value,
      per_page: 'all',
    });
    procedures.value = data || [];
    setOptions('procedure_id', procedures.value);
  }

  async function loadMeasures() {
    const { data } = await new Resource('measures').list({
      project_id: currentProjectId.value,
      per_page: 'all',
    });
    measures.value = data || [];
    syncMeasureOptions();
  }

  async function loadProcedureForms(procedureId) {
    if (!procedureId) return;
    const { data } = await new Resource('procedure-forms').list({
      procedure_id: procedureId,
      project_id: currentProjectId.value,
    });
    procedureForms.value = {};
    (data || []).forEach((item) => {
      procedureForms.value[item.measure_id] = item;
    });
    syncMeasureOptions();
  }

  /** 按工序已配置的表单过滤有效监理方式，未配置时回退全量；当前选择失效则清空 */
  function syncMeasureOptions() {
    const validMeasures = measures.value.filter((m) => procedureForms.value[m.id]);
    setOptions('measure_id', validMeasures.length ? validMeasures : measures.value);
    const current = editingItem.value?.measure_id;
    if (current && !validMeasures.some((m) => m.id === current)) {
      editingItem.value.measure_id = undefined;
    }
  }

  async function loadExecutors() {
    const { data } = await new Resource('project-users').list({
      project_id: currentProjectId.value,
      per_page: 'all',
    });
    executors.value = (data || []).map((e) => ({
      value: e.user_id,
      label: e.user?.name || `#${e.user_id}`,
    }));
    setOptions('executors', executors.value);
  }

  async function loadMileposts() {
    const { data } = await new Resource('mileposts').list({
      project_id: currentProjectId.value,
      per_page: 'all',
    });
    mileposts.value = data || [];
    setOptions('mileposts', mileposts.value);
  }

  async function loadAll() {
    if (!appStore.defaultProject) return;
    projectCategories.value =
      appStore.defaultProject.categories?.map((v) => v.id) ||
      (appStore.defaultProject.category_id ? [appStore.defaultProject.category_id] : []);
    await Promise.all([
      loadStakeholders(),
      loadDivisions(),
      loadProcedures(),
      loadMeasures(),
      loadExecutors(),
      loadMileposts(),
    ]);
  }

  // 工序变化 → 重载监理方式（联动）
  watch(
    () => editingItem.value?.procedure_id,
    async (pid) => {
      if (pid) await loadProcedureForms(pid);
    },
  );

  /** 详情回显：executors/mileposts 对象数组 → id 数组；时间区间拆分 */
  function detailFormat(e) {
    const data = { ...e };
    if (timeMode === 'combined' && data.start_time) {
      data.start_end_time = [data.start_time, data.end_time];
    }
    if (data.start_date) data.start_end_time = [data.start_date, data.end_date];
    if (Array.isArray(data.executors)) data.executors = data.executors.map((x) => x.user_id);
    if (Array.isArray(data.mileposts)) data.mileposts = data.mileposts.map((x) => x.id);
    return data;
  }

  /** 保存转换：时间区间合并；id 数组 → [{id}]；项目兜底 */
  function saveFormat(e) {
    const payload = { ...e };
    if (Array.isArray(payload.start_end_time)) {
      const [start, end] = payload.start_end_time;
      if (timeMode === 'combined') {
        payload.start_time = start;
        payload.end_time = end;
      } else {
        payload.start_date = start;
        payload.end_date = end;
      }
    }
    delete payload.start_end_time;
    if (Array.isArray(payload.executors)) payload.executors = payload.executors.map((id) => ({ id }));
    if (Array.isArray(payload.mileposts)) payload.mileposts = payload.mileposts.map((id) => ({ id }));
    payload.project_id = payload.project_id || currentProjectId.value;
    return payload;
  }

  buildFormFields();

  return {
    currentProjectId,
    formFields,
    detailFormat,
    saveFormat,
    loadAll,
    procedureForms,
  };
}
