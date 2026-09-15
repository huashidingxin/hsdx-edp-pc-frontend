<script setup>
/**
 * 字段校验规则弹窗（作为 Vben Modal 的内容组件）。
 *
 * 行式先后连接编辑器（严格对齐 zyzz 表单管理 P3-V15/V16）：
 * - 每行 = { type, value, level, message, connector }，connector 为 outgoing 语义
 *   （rows[N].connector = 第 N 行连接到第 N+1 行的方式，默认 and）；
 * - 连续 And 同组（组内 AND 全部须满足；按顺序惰性检测，首条失败的规则即报错结果）；
 * - 遇到 Or 另起一组（组间 OR）：OR 是组与组之间独立占一行、贯穿规则区域的横向分隔线；
 * - 末行 And/Or 按钮指定连接符并自动新增下一行；非末行按钮在 And ↔ Or 之间切换；
 * - 存储 bundle：根固定 or、组内固定 and（见 formSchema.js editorRowsToBundle）。
 */
import { computed, ref, watch } from 'vue';

import { Button, Input, InputNumber, Select, message } from 'antdv-next';

import {
  RULE_LEVELS,
  fieldRuleEditorRows,
  ruleTypesFor,
  setFieldRuleLeaves,
  validateRuleRows,
} from './formSchema.js';

const props = defineProps({
  field: { type: Object, default: null },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['submit', 'cancel']);

// 行式编辑器模型：[{ type, value, level, message, connector }]
const rows = ref([]);

watch(
  () => props.field,
  (field) => {
    rows.value = fieldRuleEditorRows(field);
  },
  { immediate: true },
);

// 规则操作符按字段类型给可用集合（formSchema.js ruleTypesFor，与引擎/后端对齐）
const typeOptions = computed(() => ruleTypesFor(props.field?.type));

const isNumericType = (type) =>
  ['min', 'max', 'gt', 'lt', 'ge', 'le', 'minLength', 'maxLength'].includes(type);

// 值输入框占位随字段类型联动
const valuePlaceholder = computed(() => {
  const numeric = ['number', 'digit'].includes(props.field?.type);
  return numeric ? '如 50' : '长度用数字（如 50）；内容按文本填写';
});

// 行式编辑器：末行按钮指定「当前行 → 下一行」的连接，再追加一个默认 AND 行。
// connector 统一采用 outgoing 语义，与 bundleToEditorRows/editorRowsToBundle 保持一致。
function addRowAfter(connector) {
  const normalized = connector === 'or' ? 'or' : 'and';
  const last = rows.value[rows.value.length - 1];
  if (last) last.connector = normalized;
  rows.value.push({
    type: typeOptions.value[0]?.value || 'min',
    connector: 'and',
    level: 1,
    value: '',
    message: '',
  });
}

function removeRuleLeaf(index) {
  rows.value.splice(index, 1);
}

function toggleConnector(index) {
  const row = rows.value[index];
  if (!row) return;
  row.connector = (row.connector || 'and') === 'or' ? 'and' : 'or';
}

// 行式编辑器的视觉分组：connector 表示「本行 → 下一行」的连接方式。
// 因此 OR 不属于任何一组的规则，而是两组之间的分隔符：
//   A AND B OR C AND D  =>  [A,B] -- Or 分隔线 -- [C,D]
// 组边界由「当前行 connector === or」决定；携带 OR 的行仍属于上方 AND 组，
// 分隔线绘制在下一行（下方 AND 组的第一行）之前。
function rowBracket(index) {
  const list = rows.value;
  const total = list.length;
  const empty = {
    kind: 'and',
    showBar: false,
    showDivider: false,
    showLabel: false,
    topCap: false,
    bottomCap: false,
    topGap: 0,
    bottomGap: 0,
  };
  if (total === 0 || index < 0 || index >= total) return empty;
  const connector = (idx) =>
    (list[idx]?.connector || 'and') === 'or' ? 'or' : 'and';

  // 当前行所属组的首尾：前一个 OR 后开始新组；本组包含当前 OR 边界行。
  let start = 0;
  for (let i = 0; i < index; i++) {
    if (connector(i) === 'or') start = i + 1;
  }
  let end = index;
  while (end < total - 1 && connector(end) !== 'or') end++;
  const size = end - start + 1;
  const isStart = index === start;
  const isEnd = index === end;
  // AND 标签只出现一次，位于组内连接竖线的中间（参考图）
  const isMiddle = index === start + Math.floor((end - start) / 2);
  const showDivider = index > 0 && connector(index - 1) === 'or';
  const showLabel = isMiddle && size >= 2;

  // 单行 AND 组不画左侧连接线；OR 分隔线在下方新组之前全宽绘制。
  if (size < 2) {
    return { ...empty, showDivider };
  }
  return {
    kind: 'and',
    showBar: true,
    showDivider,
    showLabel,
    topCap: isStart,
    bottomCap: isEnd,
    topGap: isStart ? 8 : 0,
    bottomGap: isEnd ? 8 : 0,
  };
}

// 行式编辑器每行的渲染信息（行 + 括号形态），模板用同一对象避免重复计算
const rowsWithBracket = computed(() =>
  rows.value.map((row, index) => ({ row, bracket: rowBracket(index) })),
);

function handleSubmit() {
  const error = validateRuleRows(rows.value, props.field?.type);
  if (error) {
    message.error(error);
    return;
  }
  emit('submit', setFieldRuleLeaves(props.field, rows.value));
}
</script>

<template>
  <div class="p-1">
    <div class="mb-2 text-xs text-gray-500">
      字段「{{ props.field?.label || props.field?.name || '' }}」的默认校验规则（恒生效）
    </div>

    <!-- 行式先后连接编辑器：连续 AND 规则组成左侧括号组；OR 是组与组之间
         独立占一行、贯穿规则区域的横向分隔线；末行 And/Or 按钮指定连接符并新增下一行。 -->
    <div class="rule-rows">
      <template v-for="(item, index) in rowsWithBracket" :key="index">
        <!-- OR 是组与组之间的全宽分隔线，不占用某条规则左侧的短横线位置。 -->
        <div v-if="item.bracket.showDivider" class="rule-row-or-divider">
          <span class="rule-row-or-divider-label">Or</span>
          <span class="rule-row-or-divider-line"></span>
        </div>

        <div class="rule-row flex items-center">
          <!-- 左侧槽位：只绘制 AND 组的括号；单行组不绘制左侧连线。 -->
          <div class="rule-row-gutter">
            <div
              v-if="item.bracket.showBar"
              class="rule-row-bar rule-row-bar--and"
              :style="{
                top: `${item.bracket.topGap}px`,
                bottom: `${item.bracket.bottomGap}px`,
              }"
            ></div>
            <div
              v-if="item.bracket.topCap"
              class="rule-row-cap-top rule-row-cap--and"
            ></div>
            <div
              v-if="item.bracket.bottomCap"
              class="rule-row-cap-bottom rule-row-cap--and"
            ></div>
            <span
              v-if="item.bracket.showLabel"
              class="rule-row-label rule-row-label--and"
            >
              And
            </span>
          </div>

          <div class="rule-row-body flex flex-1 flex-wrap items-center gap-2">
            <Select
              v-model:value="item.row.type"
              :disabled="disabled"
              :options="typeOptions"
              style="width: 170px"
              placeholder="类型"
            />
            <InputNumber
              v-if="isNumericType(item.row.type)"
              v-model:value="item.row.value"
              :disabled="disabled"
              :placeholder="valuePlaceholder"
              style="width: 130px"
            />
            <Input
              v-else
              v-model:value="item.row.value"
              :disabled="disabled"
              :placeholder="valuePlaceholder"
              style="width: 130px"
            />
            <Select
              v-model:value="item.row.level"
              :disabled="disabled"
              :options="RULE_LEVELS"
              style="width: 80px"
            />
            <Input
              v-model:value="item.row.message"
              :disabled="disabled"
              placeholder="不通过提示"
              style="flex: 1"
            />

            <!-- 末行：始终显示 And/Or 两个按钮（点击新建下一行）；非末行显示一个可切换的连接符 -->
            <template v-if="index === rows.length - 1">
              <div v-if="!disabled" class="rule-row-tail">
                <Button size="small" type="dashed" @click="addRowAfter('and')">
                  And
                </Button>
                <Button size="small" type="dashed" @click="addRowAfter('or')">
                  Or
                </Button>
              </div>
            </template>
            <template v-else>
              <Button
                v-if="!disabled"
                size="small"
                :type="(item.row.connector || 'and') === 'or' ? 'primary' : 'default'"
                @click="toggleConnector(index)"
              >
                {{ (item.row.connector || 'and') === 'or' ? 'Or' : 'And' }}
              </Button>
            </template>
            <Button
              v-if="!disabled"
              type="link"
              danger
              size="small"
              @click="removeRuleLeaf(index)"
            >
              删除
            </Button>
          </div>
        </div>
      </template>
      <div
        v-if="!rows.length"
        class="py-6 text-center text-sm text-gray-400"
      >
        <div class="mb-2">暂无规则</div>
        <Button
          v-if="!disabled"
          size="small"
          type="dashed"
          :disabled="!typeOptions.length"
          @click="addRowAfter('and')"
        >
          新增第一条规则
        </Button>
      </div>
    </div>
    <div class="mt-2 text-xs text-gray-400">
      末行的 <b>And</b> / <b>Or</b> 按钮指定连接符并自动新增下一行；非末行的按钮可在 And ↔ Or 之间切换。
      连续 And 同组（组内 AND 全部须满足；按顺序惰性检测，首条失败的规则即报错结果）；
      遇到 Or 在上下组之间显示全宽分隔线（组间 OR），分隔线不属于任一规则组。
      警告（级别 2）仅提示可提交；错误（级别 1）红字阻断提交。
      区间已拆分为「最小值」+「最大值」两条 AND 规则；规则引擎支持任意嵌套树 / 组内或。
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <Button :disabled="disabled" @click="emit('cancel')">取消</Button>
      <Button type="primary" :disabled="disabled" @click="handleSubmit">
        保存
      </Button>
    </div>
  </div>
</template>

<style scoped>
/* 行式先后连接编辑器样式 —— 与 zyzz 参考实现一致 */
.rule-rows {
  display: flex;
  flex-direction: column;
}

.rule-row {
  position: relative;
  padding: 4px 0;
  align-items: stretch;
}

.rule-row-gutter {
  position: relative;
  width: 56px;
  flex-shrink: 0;
  align-self: stretch;
}

/* OR：独立占一整行，在两个 AND 组之间横向贯穿；不再绘制在左侧 gutter 内。 */
.rule-row-or-divider {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 24px;
  margin: 4px 0;
}
.rule-row-or-divider-label {
  width: 56px;
  flex: 0 0 56px;
  padding-right: 10px;
  color: #6b7280;
  font-size: 12px;
  line-height: 18px;
  text-align: right;
  background: #fff;
}
.rule-row-or-divider-line {
  flex: 1;
  border-top: 1px dashed #d1d5db;
}

/* 连接线：贯穿该行高度，同组连续时相邻行的 bar 上下端点重合，形成一条贯通的竖线。
   多行包络时 bar 的 top/bottom 由 rowBracket() 控制以让出顶/底横线位置 */
.rule-row-bar {
  position: absolute;
  left: 12px;
  width: 2px;
  top: 0;
  bottom: 0;
}
.rule-row-bar--and {
  background: #d1d5db;
}
.rule-row-bar--or {
  background: #fb923c;
}

/* 顶/底横线：包络括号两端，从 bar 向右延伸 12px。
   只有 size>=2 的同组才渲染（首行顶在最顶、末行底在最底）。 */
.rule-row-cap-top,
.rule-row-cap-bottom {
  position: absolute;
  left: 14px;
  width: 12px;
  height: 2px;
}
.rule-row-cap-top {
  top: 6px;
}
.rule-row-cap-bottom {
  bottom: 6px;
}
.rule-row-cap--and {
  background: #d1d5db;
}
.rule-row-cap--or {
  background: #fb923c;
}

/* 连接符标签：And 只出现在组内连接竖线的中间（参考图），白底遮盖竖线该段以保持可读 */
.rule-row-label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-block;
  padding: 0 4px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  background: #fff;
  z-index: 1;
}
.rule-row-label--and {
  color: #9ca3af;
}
.rule-row-label--or {
  color: #fb923c;
}

.rule-row-tail {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
