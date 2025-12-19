<template>
  <div>
    <slot name="top"></slot>

    <!-- Validation Rules Section -->
    <div v-if="Object.values(baseRules).length" class="mt-4">
      <div class="my-2 font-weight-bold text-primary">校验规范</div>
      <div v-for="(item, index) in baseRules" :key="index"
           class="d-flex justify-space-between align-center py-2">
        <div>{{ item.name }}</div>
        <v-select
          v-model="baseRuleSelected[index]"
          :items="item.rules"
          item-title="name"
          item-value="id"
          @update:modelValue="changeBaseRule(index, $event)"
          placeholder="请选择校验规则"
          density="compact"
          variant="outlined"
        ></v-select>
      </div>
    </div>

    <v-row align="center">
      <v-col v-for="(field, index) in fields"
             :key="index"
             :cols="field?.col < 3 ? 6 : 12"
             :md="field?.col || 12"
      >
        <slot :name="field.field + '_top'" :field="field"></slot>
        <div v-if="field.type === 'list'" ref="fieldRef" class="border border-dashed pa-2 rounded-lg">
          <div class="font-weight-bold mb-2">{{field.label}}</div>
          <div v-for="(item, itemIndex) in editedItem[field.field] || []"
               :key="itemIndex" class="mb-4">

            <v-card variant="outlined" class="pa-3 position-relative">
              <v-card-title class="">
                <div class="mr-2 list-item-index bg-primary">{{ itemIndex + 1 }}.</div>
                <v-btn
                  v-if="field.attrs.disabled !== true"
                  @click="deleteListItem(field.field, itemIndex)"
                  icon
                  size="small"
                  color="error"
                  class="mt-2 delete-button"
                >
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </v-card-title>
              <v-card-text>
                <app-form
                  ref="childForms"
                  :fields="field.children"
                  v-model:modelValue="editedItem[field.field][itemIndex]"
                  :rules="rules[field.field]?.[itemIndex]"
                  @update:warnings="handleChildWarnings(field.field, itemIndex, $event)"
                  @update:model-value="handleChildChange(field.field, itemIndex, $event)"
                  @update:base-rule="handleChildBaseRule(field.field, itemIndex, $event)"
                  bottom-height="0"
                />
              </v-card-text>


            </v-card>
          </div>
          <div class="my-3 d-flex justify-end">
            <v-btn
              v-if="field.attrs.disabled !== true"
              @click="addListItem(field.field)"
              color="primary"
              size="small"
            >
              <v-icon start>mdi-plus</v-icon>
              增加
            </v-btn>
          </div>
        </div>
        <AppField
          v-else
          ref="fieldRef"
          :key="'field_'+field.field"
          v-model="editedItem[field.field]"
          :field="{...field,rules:filedRules[field.field]?.rules}"
        />
      </v-col>
    </v-row>
    <!-- Form Fields Rendering -->
<!--    <v-row align="center">-->
<!--      <v-col v-for="(field, index) in fields"-->
<!--             :key="index"-->
<!--             :cols="field?.col < 3 ? 6 : 12"-->
<!--             :md="field?.col || 12"-->
<!--      >-->
<!--        <slot :name="field.field + '_top'" :field="field"></slot>-->

<!--        <div v-if="field.type !== 'hidden'">-->
<!--          <div-->
<!--            class="pb-1 mb-2"-->
<!--            :class="[setFormItemClass(field.field)]"-->
<!--            @click="focusChange(field.field)"-->
<!--          >-->
<!--            <div-->
<!--              :class="[-->
<!--              currentFocus == field.field && !errors[field.field] ? 'border-primary' : '',-->
<!--              errors[field.field] ? 'border-error' : ''-->
<!--            ]"-->
<!--              :style="field.style"-->
<!--              variant="flat"-->
<!--            >-->
<!--              <div :class="field.direction == 'row' ? 'd-flex align-center' : 'd-flex flex-column'">-->
<!--                &lt;!&ndash; Field Label &ndash;&gt;-->
<!--&lt;!&ndash;                <div&ndash;&gt;-->
<!--&lt;!&ndash;                  class="field-label"&ndash;&gt;-->
<!--&lt;!&ndash;                  :style="{ minWidth: labelWidth }"&ndash;&gt;-->
<!--&lt;!&ndash;                  :class="field.direction == 'row' ? '' : 'mb-2'"&ndash;&gt;-->
<!--&lt;!&ndash;                >&ndash;&gt;-->
<!--&lt;!&ndash;                  <span class="required-field">{{ field.required ? '*' : ' ' }}</span>&ndash;&gt;-->
<!--&lt;!&ndash;                  {{ field.label }}&ndash;&gt;-->
<!--&lt;!&ndash;                  <span&ndash;&gt;-->
<!--&lt;!&ndash;                    class="text-caption"&ndash;&gt;-->
<!--&lt;!&ndash;                    :class="field.direction == 'row' ? 'd-block' : ''"&ndash;&gt;-->
<!--&lt;!&ndash;                    :style="[field.label_desc_style]"&ndash;&gt;-->
<!--&lt;!&ndash;                    v-if="field.label_desc"&ndash;&gt;-->
<!--&lt;!&ndash;                  >&ndash;&gt;-->
<!--&lt;!&ndash;                  {{ field.label_desc }}&ndash;&gt;-->
<!--&lt;!&ndash;                </span>&ndash;&gt;-->
<!--&lt;!&ndash;                </div>&ndash;&gt;-->

<!--                &lt;!&ndash; Field Content &ndash;&gt;-->
<!--                <div-->
<!--                  :class="field.direction === 'row' ? 'flex-grow-1 d-flex align-center justify-space-between' : ''">-->
<!--                  <div class="flex-grow-1">-->
<!--                    &lt;!&ndash; List Type Field &ndash;&gt;-->
<!--                    <div v-if="field.type === 'list'" ref="fieldRef">-->
<!--                      <div v-for="(item, itemIndex) in editedItem[field.field] || []"-->
<!--                           :key="itemIndex" class="mb-4">-->
<!--                        <v-card variant="outlined" class="pa-3">-->
<!--                          <div class="d-flex align-center">-->
<!--                            <div class="mr-2">{{ itemIndex + 1 }}.</div>-->
<!--                            <app-form-->
<!--                              ref="childForms"-->
<!--                              :fields="field.children"-->
<!--                              v-model:modelValue="editedItem[field.field][itemIndex]"-->
<!--                              :rules="rules[field.field]?.[itemIndex]"-->
<!--                              @update:warnings="handleChildWarnings(field.field, itemIndex, $event)"-->
<!--                              @update:model-value="handleChildChange(field.field, itemIndex, $event)"-->
<!--                              @update:base-rule="handleChildBaseRule(field.field, itemIndex, $event)"-->
<!--                              bottom-height="0"-->
<!--                            />-->
<!--                          </div>-->
<!--                          <v-btn-->
<!--                            v-if="field.attrs.disabled !== true"-->
<!--                            @click="deleteListItem(field.field, itemIndex)"-->
<!--                            icon-->
<!--                            size="small"-->
<!--                            color="error"-->
<!--                            class="mt-2"-->
<!--                          >-->
<!--                            <v-icon>mdi-delete</v-icon>-->
<!--                          </v-btn>-->
<!--                        </v-card>-->
<!--                      </div>-->
<!--                      <div class="my-3 d-flex justify-end">-->
<!--                        <v-btn-->
<!--                          v-if="field.attrs.disabled !== true"-->
<!--                          @click="addListItem(field.field)"-->
<!--                          color="primary"-->
<!--                          size="small"-->
<!--                        >-->
<!--                          <v-icon start>mdi-plus</v-icon>-->
<!--                          增加-->
<!--                        </v-btn>-->
<!--                      </div>-->
<!--                    </div>-->

<!--                    &lt;!&ndash; Slot Type Field &ndash;&gt;-->
<!--                    <div v-else-if="field.type == 'slot'" ref="fieldRef">-->
<!--                      <slot :name="field.field"></slot>-->
<!--                    </div>-->

<!--                    &lt;!&ndash; File Upload Field &ndash;&gt;-->
<!--                    <div v-else-if="field.type == 'file'">-->
<!--                      <v-file-input-->
<!--                        ref="fieldRef"-->
<!--                        v-model="editedItem[field.field]"-->
<!--                        @blur="blur(field)"-->
<!--                        @change="change(field, $event)"-->
<!--                        :disabled="field.attrs?.disabled"-->
<!--                        :readonly="field.attrs?.readonly"-->
<!--                        :multiple="field.attrs?.multiple"-->
<!--                        :accept="field.attrs?.accept"-->
<!--                        variant="outlined"-->
<!--                        density="compact"-->
<!--                      ></v-file-input>-->
<!--                    </div>-->

<!--                    &lt;!&ndash; Select Field &ndash;&gt;-->
<!--                    <v-select-->
<!--                      v-else-if="field.type == 'select' || field.type == 'multiselect'"-->
<!--                      v-model="editedItem[field.field]"-->
<!--                      ref="fieldRef"-->
<!--                      :key="field.field"-->
<!--                      @blur="blur(field)"-->
<!--                      @update:modelValue="change(field, $event)"-->
<!--                      :label="'请选择' + field.label"-->
<!--                      :items="field.attrs?.items || []"-->
<!--                      :multiple="field.attrs?.multiple || field.type == 'multiselect'"-->
<!--                      :disabled="field.attrs?.disabled"-->
<!--                      :readonly="field.attrs?.readonly"-->
<!--                      variant="outlined"-->
<!--                      density="compact"-->
<!--                    >-->
<!--                      <template v-slot:append>-->
<!--                        <slot :name="field.field + '_select_bottom'"></slot>-->
<!--                      </template>-->
<!--                    </v-select>-->

<!--                    &lt;!&ndash; Datetime Field &ndash;&gt;-->
<!--                    <v-text-field-->
<!--                      v-else-if="field.type === 'datetime'"-->
<!--                      v-model="editedItem[field.field]"-->
<!--                      ref="fieldRef"-->
<!--                      :key="field.field"-->
<!--                      @blur="blur(field)"-->
<!--                      @update:modelValue="change(field, $event)"-->
<!--                      :label="'请选择' + field.label"-->
<!--                      type="datetime-local"-->
<!--                      variant="outlined"-->
<!--                      density="compact"-->
<!--                    ></v-text-field>-->

<!--                    &lt;!&ndash; Number Box Field &ndash;&gt;-->
<!--                    <v-text-field-->
<!--                      v-else-if="field.type == 'number-box'"-->
<!--                      v-model="editedItem[field.field]"-->
<!--                      ref="fieldRef"-->
<!--                      type="number"-->
<!--                      :style="{ width: field.width || '80px' }"-->
<!--                      :min="field.min"-->
<!--                      :max="field.max"-->
<!--                      :step="field.step || 1"-->
<!--                      variant="outlined"-->
<!--                      density="compact"-->
<!--                    ></v-text-field>-->

<!--                    &lt;!&ndash; Switch Field &ndash;&gt;-->
<!--                    <v-switch-->
<!--                      v-else-if="field.type == 'switch'"-->
<!--                      v-model="editedItem[field.field]"-->
<!--                      ref="fieldRef"-->
<!--                      :true-value="1"-->
<!--                      :false-value="0"-->
<!--                      @blur="blur(field)"-->
<!--                      @update:modelValue="change(field, $event)"-->
<!--                      :disabled="field.attrs?.disabled"-->
<!--                      :readonly="field.attrs?.readonly"-->
<!--                      class="ml-auto"-->
<!--                      color="primary"-->
<!--                    ></v-switch>-->

<!--                    &lt;!&ndash; Textarea Field &ndash;&gt;-->
<!--                    <v-textarea-->
<!--                      v-else-if="field.type == 'textarea'"-->
<!--                      v-model="editedItem[field.field]"-->
<!--                      ref="fieldRef"-->
<!--                      @blur="blur(field)"-->
<!--                      @update:modelValue="change(field, $event)"-->
<!--                      :disabled="field.attrs?.readonly === true"-->
<!--                      variant="outlined"-->
<!--                      density="compact"-->
<!--                      auto-grow-->
<!--                    ></v-textarea>-->

<!--                    &lt;!&ndash; Default Input Field &ndash;&gt;-->
<!--                    <v-text-field-->
<!--                      v-else-->
<!--                      v-model="editedItem[field.field]"-->
<!--                      :label="field.name"-->
<!--                      ref="fieldRef"-->
<!--                      @blur="blur(field)"-->
<!--                      @update:modelValue="change(field, $event)"-->
<!--                      :type="field.type || 'text'"-->
<!--                      :disabled="field.attrs?.disabled"-->
<!--                      :readonly="field.attrs?.readonly"-->
<!--                      hide-details-->

<!--                    ></v-text-field>-->
<!--                  </div>-->
<!--                  <div class="text-right text-caption text-grey" v-if="field.count">-->
<!--                    {{ editedItem[field.field] ? editedItem[field.field].length : 0 }}/{{-->
<!--                      field.max-->
<!--                    }}-->
<!--                  </div>-->
<!--                </div>-->
<!--              </div>-->
<!--            </div>-->
<!--            <div class="hint mt-1 text-caption text-error" v-if="errors[field.field]">-->
<!--              {{ errors[field.field] }}-->
<!--            </div>-->
<!--            <div class="hint mt-1 text-caption text-warning" v-else-if="warnings[field.field]">-->
<!--              {{ warnings[field.field].message }}-->
<!--            </div>-->
<!--          </div>-->
<!--        </div>-->
<!--        <slot :name="field.field + '_bottom'" :field="field"></slot>-->
<!--      </v-col>-->
<!--    </v-row>-->
    <div :style="{ height: bottomHeight }"></div>
  </div>
</template>

<script setup>
import {ref, watch, nextTick, reactive, computed} from 'vue';
import {debounce} from "lodash";
import {
  VAutocomplete,
  VCombobox,
  VSelect,
  VSwitch,
  VTextarea,
  VTextField
} from "vuetify/components";
import {VDateInput} from "vuetify/lib/labs/VDateInput/index.js";
import FormDatetime from "#/components/AppDatetime.vue";
import AppTreeSelect from "#/components/AppTreeSelect.vue";
import FormRegion from "#/components/AppRegion/index.vue";
import AppEditor from "#/components/AppEditor/index.vue";
import AppUpload from "#/components/AppUpload.vue";

const props = defineProps({
  fields: {
    type: Array,
    default: () => ([])
  },
  rules: {
    type: Object,
    default: () => ({})
  },
  labelWidth: {
    type: String,
    default: '26vw'
  },
  modelValue: {
    default: () => ({}),
    type: Object,
  },
  bottomHeight: {
    type: String,
    default: '60px'
  }
});

const emit = defineEmits(['update:model-value', 'update:base-rule', 'update:focused', 'update:warnings']);
const editedItem = ref({});
const defaultItem = ref({});
const currentFocus = ref('');
const errors = ref({});
const warnings = ref({});
const fileRef = ref(null);
const fieldRef = ref([]);
const baseRules = ref([]);
const childForms = ref([]);
let allWarnings = reactive({});

// Each field's selectedBaseRule
const fieldBaseRules = ref({});
const baseRuleSelected = ref({})
const filedRules = ref({
  rules: [],
  warnings: []
})

watch(
  () => props.modelValue,
  (newVal) => {
    // Initialize editedItem
    props.fields.forEach((e) => {
      if (!editedItem.value[e.field]) {
        if (e.default) {
          editedItem.value[e.field] = e.default;
        } else if (e.type === 'switch') {
          editedItem.value[e.field] = "0";
        } else if (e.type === 'list') {
          // Default add a set of sub-fields
          editedItem.value[e.field] = [initializeSubFields(e.children)];
        }
      }
      if (e.field.indexOf('.') > 0) {
        const fieldArr = e.field.split('.');
        if (newVal[fieldArr[0]]) {
          editedItem.value[e.field] = newVal[fieldArr[0]][fieldArr[1]];
        }
      }
    });
    Object.assign(editedItem.value, newVal);
  }, {
    deep: true,
    immediate: true,
  }
);

watch(
  () => props.fields,
  (newFields) => {
    if (!newFields?.length) {
      return
    }
    initializeFieldBaseRules()
    newFields.forEach((e) => {
      if (!editedItem.value[e.field]) {
        if (e.type === 'switch') {
          editedItem.value[e.field] = e.default || '0';
        }
        if (e.type === 'list') {
          editedItem.value[e.field] = [initializeSubFields(e.children)];
        } else {
          editedItem.value[e.field] = e.default || '';
        }
      }
    });
  }, {
    immediate: true
  }
);

watch(() => props.rules, (newRules) => {
  initializeFieldBaseRules()
}, {immediate: true})

// Initialize field's baseRule
function initializeFieldBaseRules() {
  formatBaseRules()
  props.fields.forEach(field => {
    if (field.base_rules?.length) {
      // Default select the first base_rule
      fieldBaseRules.value[field.field] = !isNaN(props.rules[field.field]) ? props.rules[field.field] : field.base_rules[0].rule_id;
    }
  });
}

// Use only one validation standard at the same level
function formatBaseRules() {
  let categories = {}
  let _rules = {}
  props.fields.forEach((field) => {
    if (field.base_rules?.length) {
      field.base_rules.forEach((e) => {
        if (e.rule_id > 0) {
          if (!categories[e.rule_category_id]) {
            categories[e.rule_category_id] = {
              id: e.rule_category_id,
              name: e.rule_category_name,
              rules: []
            }
          }
          if (!_rules[e.rule_id + ""]) {
            _rules[e.rule_id + ''] = {
              id: e.rule_id,
              category_id: e.rule_category_id,
              name: e.rule_name,
            }

            categories[e.rule_category_id].rules.push(_rules[e.rule_id])
          }
        }
      })
    }
  })
  baseRules.value = categories;
  for (let i in categories) {
    baseRuleSelected.value[i] = categories[i].rules[0].id
    if (Object.values(props.rules || {}).length) {
      for (let fieldKey in props.rules) {
        const _rule = categories[i].rules.find(v => v.id == props.rules[fieldKey])
        if (_rule) {
          baseRuleSelected.value[i] = _rule.id
          break;
        }
      }
    }
  }
}

// Watch field's baseRule changes
function changeBaseRule(baseRuleCategoryId, ruleId) {
  props.fields.forEach((field) => {
    if (field.base_rules) {
      for (let i in field.base_rules) {
        if (field.base_rules[i].rule_category_id == baseRuleCategoryId) {
          fieldBaseRules.value[field.field] = baseRuleSelected.value[baseRuleCategoryId]
          validateField(field)
          continue
        }
      }
    }
  })

  updateFormData()
}

// Get field's validation rules
function getFieldRules(field) {
  let list = {
    rules: [],
    warnings: []
  };
  let _rules = field.rules || [];
  if (field.base_rules?.length) {
    const selectedRuleId = fieldBaseRules.value[field.field];
    _rules = _rules.concat(field.base_rules.filter(v => v.rule_id === selectedRuleId));
  }
  if (field.warning?.length) {
    list.warning = field.warning.map((e) => {
      return formatRule(e, field.type)
    })
  }

  _rules.forEach((e) => {
    if (typeof e === 'function') {
      list.rules.push(e)
    } else {
      const _rule = formatRule(e, field.type)
      if (e.level == 2) {
        list.warnings.push(_rule)
      } else {
        list.rules.push(_rule)
      }
    }
  })
  filedRules.value[field.field] = list
}

function formatRule(e, type) {
  let _rule = e
  if (typeof e !== 'function') {
    const isNumeric = ['number', 'digit'].includes(type)
    const errMsg = e.message || '格式有误';
    switch (e.type) {
      case 'required':
        if (type !== 'switch' && !isNumeric) {
          _rule = (v => !!v || errMsg)
        } else {
          _rule = (v => v !== undefined && v !== null || errMsg)
        }
        break;
      case 'min':
      case 'minLength':
        if (isNumeric) {
          _rule = (v => v >= parseFloat(e.value) || errMsg)
        } else {
          _rule = (v => !!v && v.length >= e.value || errMsg)
        }
        break;
      case 'max':
      case 'maxLength':
        if (isNumeric) {
          _rule = (v => v <= parseFloat(e.value) || errMsg)
        } else {
          _rule = (v => !!v && v.length <= e.value || errMsg)
        }
        break;
      case 'range':
        const range = Array.isArray(e.value) ? e.value : e.value.split('-')
        _rule = (v => v >= parseFloat(range[0]) && v <= parseFloat(range[1]) || errMsg)
        break;
      case 'eq':
      case '=':
        _rule = v => v == e.value || errMsg
        break
      default:
        _rule = v => v == e.value || errMsg
    }
  }
  return _rule
}

// Format data, including field values and validation rules
function formatData() {
  let requestData = Object.assign({}, editedItem.value);
  for (let key in requestData) {
    if (key.indexOf('.') > 0) {
      const keyArr = key.split('.');
      if (!requestData[keyArr[0]]) {
        requestData[keyArr[0]] = {};
      }
      requestData[keyArr[0]][keyArr[1]] = requestData[key];
      delete requestData[key];
    }
  }
  let baseRuleData = {}

  function processField(data, ruleData, prefix = '') {
    for (let key in data) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      ruleData[key] = props.rules[key]
      if (typeof data[key] === 'object' && !Array.isArray(data[key])) {
        if (!ruleData[key]) {
          ruleData[key] = props.rules[key] || {};
        }
        processField(data[key], ruleData[key], fullKey);
      } else {
        ruleData[key] = fieldBaseRules.value[fullKey] || null;
      }
    }
  }

  processField(requestData, baseRuleData);

  return {
    data: requestData,
    baseRule: baseRuleData
  };
}

// Triggered when field value changes
function change(field, e) {
  editedItem.value[field.field] = e;
  if (validateField(field)) {
    updateFormData()
  }
}

// Handle child component field value changes
function handleChildChange(parentField, index, childData) {
  if (!editedItem.value[parentField]) {
    editedItem.value[parentField] = [];
  }
  editedItem.value[parentField][index] = childData;
  updateFormData()
}

// Handle child component validation rule changes
function handleChildBaseRule(parentField, index, childBaseRule) {
  fieldBaseRules.value[parentField] = props.rules?.[parentField] || {}
  fieldBaseRules.value[parentField][index] = childBaseRule;
  updateFormData()
}

function updateFormData() {
  const formattedData = formatData();
  emit('update:model-value', formattedData.data);
  emit('update:base-rule', formattedData.baseRule);
}

function setFormItemClass(field) {
  return [
    currentFocus.value == field ? 'item-focus' : '',
    errors.value[field] ? 'has-error' : '',
    warnings.value[field] ? 'has-warning' : ''
  ];
}

function focusChange(name) {
  const _field = props.fields.find(v => v.field === name);
  if (currentFocus.value !== name || _field.type == 'slot') {
    currentFocus.value = name;
    emit('update:focused', name);
    return;
  }
}

function blur(field = '') {
  currentFocus.value = '';
  if (field) {
    validate(field, 'blur');
  }
}

// Validation logic
async function validate() {
  let isValid = true;

  // Validate current component's fields
  for (let index in props.fields) {
    const field = props.fields[index];
    if (!validateField(field)) {
      isValid = false;
    }
  }

  // Recursively validate child components
  for (let childForm of childForms.value) {
    const childIsValid = await childForm.validate();
    if (!childIsValid) {
      isValid = false;
    }
  }

  allWarnings = getAllWarnings();
  emit('update:warnings', allWarnings);
  return isValid;
}

// Validate single field
function validateField(field) {
  const value = editedItem.value[field.field];
  getFieldRules(field)
  let rules = filedRules.value[field.field]?.rules || []
  for (let i in rules) {
    let ret = rules[i](value);
    if (ret !== true) {
      errors.value[field.field] = ret || field.label + '格式有误';
      return false;
    }
  }
  delete errors.value[field.field];
  validateWarnings(field);
  return true;
}

// Validate warnings
function validateWarnings(field) {
  getFieldRules(field)
  let rules = filedRules.value[field.field]?.warnings || []
  const value = editedItem.value[field.field];
  rules.forEach((rule) => {
    let ret = rule(value);
    if (ret !== true) {
      warnings.value[field.field] = {
        message: ret || field.label + '不符合期望值',
        value: value
      };
    } else {
      delete warnings.value[field.field];
    }
  });
}

// Get all warning messages
function getAllWarnings() {
  let allWarnings = {};
  for (let key in warnings.value) {
    if (!warnings.value[key]) {
      continue;
    }
    if (!allWarnings[key]) {
      allWarnings[key] = [];
    }
    allWarnings[key].push(warnings.value[key]);
  }
  for (let childForm of childForms.value) {
    const childWarnings = childForm.getAllWarnings();
    for (let key in childWarnings) {
      if (!childWarnings[key]) {
        continue;
      }
      if (!allWarnings[key]) {
        allWarnings[key] = [];
      }
      allWarnings[key] = allWarnings[key].concat(childWarnings[key]);
    }
  }
  return allWarnings;
}

// Handle child component's warning messages
function handleChildWarnings(parentField, index, childWarnings) {
  // Handle child component's warning messages
}

// Dynamically add list item
function addListItem(fieldId) {
  if (!editedItem.value[fieldId]) {
    editedItem.value[fieldId] = [];
  }
  const newItem = initializeSubFields(props.fields.find(f => f.field === fieldId).children);
  editedItem.value[fieldId].push(newItem);
  emit('update:model-value', formatData().data);
}

// Delete list item
function deleteListItem(fieldId, index) {
  editedItem.value[fieldId].splice(index, 1);
  emit('update:model-value', formatData().data);
}

// Recursively initialize sub-fields
function initializeSubFields(children) {
  const newItem = children.reduce((acc, subField) => {
    if (subField.type === 'list') {
      acc[subField.field] = [initializeSubFields(subField.children)];
    } else {
      acc[subField.field] = subField.default || '';
    }
    return acc;
  }, {});
  return newItem;
}

defineExpose({
  validate,
  validateWarnings,
  getAllWarnings,
  fieldRef,
  childForms,
  editedItem
});
</script>

<style scoped>


.field-label {
  font-weight: 500;
}

.hint {
  min-height: 20px;
}

.border-primary {
  border: 1px solid var(--v-primary-base);
}

.border-error {
  border: 1px solid var(--v-error-base);
}

.item-focus {
  transition: all 0.3s ease;
}

.has-error {
  color: var(--v-error-base);
}

.has-warning {
  color: var(--v-warning-base);
}

.list-item {
  position: relative;
  margin-bottom: 10px;
  padding: 15px;
  border: 1px solid #eee;
  border-radius: 8px;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.list-item-content {
  /* margin-right: 30px; */
  /* 为删除按钮留出空间 */
}

.list-item-index {
  position: absolute;
  left: 0;
  top: 0;
  color: white;
  padding: 3px;
  font-size: 12px;
  border-radius: 3px 0px 20px 0px;
}

.delete-button {
  position: absolute;
  top: -5px;
  right: 5px;
  width: 24px;
  height: 24px;
  padding: 0;
  background-color: #dc3545;
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.delete-button:hover {
  background-color: #c82333;
}

.add-button {
  margin-top: 10px;
  padding: 8px 16px;
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.add-button:hover {
  background-color: #0056b3;
}
</style>
