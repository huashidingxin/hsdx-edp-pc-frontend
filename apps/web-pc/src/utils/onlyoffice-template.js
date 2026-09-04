const commonModels = {
  1: [
    { key: 'template_code', name: '表编号' },
    { key: 'submission_code', name: '文档编号' },
    { key: 'signature_image', name: '手写签名' },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
  2: [
    { key: 'template_code', name: '表编号' },
    { key: 'submission_code', name: '文档编号' },
    { key: 'signature_image', name: '手写签名' },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
  3: [
    { key: 'template_code', name: '表编号' },
    { key: 'submission_code', name: '文档编号' },
    { key: 'signature_image', name: '手写签名' },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 把后端 forms/{id}.fields 转为字段选择器使用的树。
 * 字段 key 保持现有渲染器约定：表单字段使用 _{id}，公共字段使用业务路径。
 */
export function buildTemplateFieldTree(fields = []) {
  const nodes = fields.map((field) => ({
    ...field,
    key: field.key || `_${field.id}`,
    children: [],
  }));
  const byId = new Map(nodes.map((field) => [String(field.id), field]));
  const roots = [];

  nodes.forEach((field) => {
    const parentId = field.parent_id;
    const parent =
      parentId !== null && parentId !== undefined && parentId !== 0
        ? byId.get(String(parentId))
        : null;
    if (parent) {
      parent.children.push(field);
    } else {
      roots.push(field);
    }
  });

  return roots;
}

/**
 * 复用模板渲染时的公共变量，并追加当前表单字段树。
 */
export function formatTemplateFields(fields = [], type = 2) {
  const fieldTree = buildTemplateFieldTree(fields);
  const common = clone(commonModels[type] || commonModels[2]);

  common.forEach((field) => {
    if (field.children?.length) {
      field.children = field.children.map((child) => ({
        key: `${field.key}.${child.key}`,
        name: `${child.name}(${field.name})`,
      }));
    }
  });

  return [...common, { key: 'fields', name: '字段', children: fieldTree }];
}
