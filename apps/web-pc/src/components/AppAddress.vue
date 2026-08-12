<script setup lang="ts">
/**
 * AppAddress 地址选择器组件
 * 纯 Vue 实现，不依赖任何第三方 UI 组件
 * 参考 @alicd/oc-address，属性命名遵循 Ant Design Vue 规范
 *
 * 数据源：
 *   1. 通过 requestAddressUrl 远程加载（默认阿里 division-data）
 *   2. 通过 options 属性传入本地树形数据
 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

// ============ 类型定义 ============

/** 行政区划层级类型（参考 oc-address PANE_LEVEL_KEYS） */
export type LevelKey = 'city' | 'country' | 'district' | 'province' | 'town';

export interface AddressNode {
  code: string;
  name: string;
  /** 子节点列表 */
  children?: AddressNode[];
  /** 层级类型标识（用于动态 Tab 渲染，解决直筒子市/直辖县等层级不一致问题） */
  levelKey?: LevelKey;
  /** 拼音（用于拼音搜索，tdist 数据自带） */
  pinyin?: string;
}

/**
 * 动态列描述（替代原来的固定列索引）
 * oc-address 的 getShownTabs() 思路：根据实际选中链路的子节点动态生成列
 */
interface DerivedColumn {
  /** 列在动态列数组中的索引（0-based） */
  index: number;
  /** 该列的层级类型 */
  levelKey: LevelKey;
  /** 该列的标题 */
  label: string;
  /** 该列对应的父节点（即上一列选中的节点） */
  parentNode: AddressNode | null;
  /** 该列的数据列表（parentNode 的 children） */
  data: AddressNode[];
}

export interface AddressValue {
  country?: number | string;
  province?: number | string;
  city?: number | string;
  district?: number | string;
  town?: number | string;
  /** 完整地区名称（拼接后的字符串，如"北京市/北京市/朝阳区"） */
  full_region?: string;
}

export type AddressSize = 'large' | 'middle' | 'small';

/** tdist 原始数据格式: { [code]: [name, parentCode, pinyin, ...] } */
type TDistRecord = Record<string, [string, string, string, ...any[]]>;

const props = withDefaults(
  defineProps<{
    allowClear?: boolean;
    class?: string;
    defaultValue?: AddressValue | null;
    disabled?: boolean;
    level?: number;
    /** 列表展示模式：'vertical'(默认) 纵排 | 'horizontal' 横排 */
    listMode?: 'horizontal' | 'vertical';
    modelValue?: AddressValue | null | string;
    options?: AddressNode[];
    overseas?: boolean;
    placeholder?: string;
    popupFixedWidth?: boolean;
    requestAddressUrl?: string;
    requestStreetApi?:
      | ((params: { code: string; name: string }) => string)
      | string;
    showSearch?: boolean;
    size?: AddressSize;
    style?: Record<string, any>;
    value?: AddressValue | null | string;
  }>(),
  {
    modelValue: null,
    defaultValue: null,
    overseas: false,
    level: 3,
    size: 'middle',
    placeholder: '请选择地址',
    disabled: false,
    allowClear: false,
    showSearch: true,
    popupFixedWidth: true,
    listMode: 'horizontal',
    class: undefined,
    style: () => ({}),
    options: undefined,
    requestAddressUrl: '//division-data.alicdn.com/simple/addr_4_1111_1_0.js',
    requestStreetApi:
      'https://lsp.wuliu.taobao.com/locationservice/addr/output_address_town_array.do?l1={0}&l2={1}&l3={2}',
  },
);

const emit = defineEmits<{
  change: [value: AddressValue | null, nodeChain: AddressNode[]];
  'update:modelValue': [value: AddressValue | null];
  'update:value': [value: AddressValue | null];
}>();

// ============ 层级分配（参考 oc-address labelLevelKey）============
/** LevelKey → 显示标题 映射（参考 oc-address PANE_ATTRIBUTES） */
const LEVEL_LABELS: Record<LevelKey, string> = {
  country: '国家',
  province: '省份',
  city: '城市',
  district: '区县',
  town: '街道',
};

/** LevelKey → 排序索引（用于判断是否超过 maxLevel） */
const LEVEL_ORDER: Record<LevelKey, number> = {
  country: 0,
  province: 1,
  city: 2,
  district: 3,
  town: 4,
};

const LEVEL_SEQUENCE: LevelKey[] = [
  'country',
  'province',
  'city',
  'district',
  'town',
];

function assignLevelKeysByDepth(
  nodes: AddressNode[],
  startDepth: number,
): void {
  for (const node of nodes) {
    if (startDepth < LEVEL_SEQUENCE.length) {
      node.levelKey = LEVEL_SEQUENCE[startDepth];
    }
    if (node.children?.length) {
      assignLevelKeysByDepth(node.children, startDepth + 1);
    }
  }
}

// ============ 响应式状态 ============
const visible = ref(false);
const searchText = ref('');
const activeColumn = ref(0);
const loading = ref(false);
const loadError = ref(false);

const selectedCodes = ref<Record<string, number | string | undefined>>({});
const selectedNodes = ref<AddressNode[]>([]);
const derivedColumns = ref<DerivedColumn[]>([]);
const hoveredNode = ref<null | { colIndex: number; node: AddressNode }>(null);

const triggerRef = ref<HTMLElement | null>(null);
const popupRef = ref<HTMLElement | null>(null);
const rawTreeData = shallowRef<AddressNode[]>([]);

// ============ 计算属性 ============
const isReady = computed(() => {
  if (props.options) return true;
  return rawTreeData.value.length > 0;
});

const displayText = computed(() => {
  if (selectedNodes.value.length === 0) return '';
  return selectedNodes.value
    .map((n) => n.name)
    .filter(Boolean)
    .join(' / ');
});

const activeColumnData = computed(() => {
  const col = visibleColumns.value[activeColumn.value];
  const data = col?.data ?? [];
  if (!searchText.value.trim() || !props.showSearch) return data;
  const keyword = searchText.value.trim().toLowerCase();
  return data.filter(
    (item) =>
      item.name.toLowerCase().includes(keyword) ||
      item.code.includes(keyword) ||
      (item.pinyin && item.pinyin.toLowerCase().includes(keyword)) ||
      (item.pinyin && pinyinToAbbr(item.pinyin).includes(keyword)),
  );
});

/** 拼音转首字母缩写（如 'zhengzhou' → 'zz'，支持首字母搜索） */
function pinyinToAbbr(pinyin: string): string {
  return pinyin
    .replaceAll(/[^a-z\s]/gi, '')
    .split(/\s+/)
    .map((s) => s[0] || '')
    .join('')
    .toLowerCase();
}

/**
 * 动态 Tab 列（完全由选中链路的子节点层级驱动，不预设固定数量）
 */
const visibleColumns = computed(() => derivedColumns.value);

// ============ 数据加载 & 解析 ============

async function fetchAddressData(): Promise<void> {
  if (props.options) return;
  if (!props.requestAddressUrl) return;

  loadError.value = false;
  loading.value = true;
  try {
    const url = props.requestAddressUrl.startsWith('//')
      ? `${window.location.protocol}${props.requestAddressUrl}`
      : props.requestAddressUrl;
    const tdist = await loadScriptTDist(url);
    rawTreeData.value = buildTreeFromTDist(tdist);
  } catch (error) {
    console.warn('[AppAddress] 加载行政区划数据失败:', error);
    loadError.value = true;
    rawTreeData.value = [];
  } finally {
    loading.value = false;
  }
}

function loadScriptTDist(url: string): Promise<TDistRecord> {
  return new Promise((resolve, reject) => {
    if ((window as any).tdist) {
      resolve((window as any).tdist as TDistRecord);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.addEventListener('load', () => {
      const data = (window as any).tdist;
      if (data) resolve(data);
      else reject(new Error('脚本执行后 window.tdist 不存在'));
      (window as any).tdist = undefined;
    });
    script.onerror = () => {
      script.remove();
      reject(new Error(`加载行政区划脚本失败: ${url}`));
    };
    document.head.append(script);
  });
}

// ============ 国家列表（由远程 tdist 数据动态填充） ============
const DEFAULT_FALLBACK: AddressNode[] = [
  { code: 'CN', name: '中国', children: [], levelKey: 'country' },
  { code: 'OTHER', name: '其他', children: [], levelKey: 'country' },
];

const streetDataCache = new Map<string, AddressNode[]>();
const streetLoadingMap = new Map<string, Promise<AddressNode[]>>();

function buildTreeFromTDist(tdist: TDistRecord): AddressNode[] {
  const nodeMap = new Map<string, AddressNode>();
  for (const [code, arr] of Object.entries(tdist)) {
    const name = decodeUnicode(arr[0]);
    const pinyin = arr.length > 2 ? arr[2] : undefined;
    nodeMap.set(code, {
      code,
      name,
      children: [],
      pinyin: typeof pinyin === 'string' ? decodeUnicode(pinyin) : undefined,
    });
  }

  const earthNode: AddressNode = { code: '0', name: '__EARTH__', children: [] };
  nodeMap.set('0', earthNode);

  for (const [code, node] of nodeMap) {
    if (code === '0') continue;
    const entry = tdist[code];
    if (!entry) continue;
    const parentCode = entry[1];
    if (
      parentCode !== undefined &&
      parentCode !== null &&
      parentCode !== '' &&
      nodeMap.has(parentCode)
    ) {
      nodeMap.get(parentCode)!.children!.push(node);
    } else {
      earthNode.children!.push(node);
    }
  }

  sortNodes(earthNode.children!);
  assignLevelKeysByDepth([earthNode], -1);

  if (!props.overseas) {
    const chinaNode = nodeMap.get('1');
    return chinaNode?.children ?? [];
  }
  return earthNode.children!;
}

function sortNodes(nodes: AddressNode[]): void {
  nodes.sort((a, b) => Number(a.code) - Number(b.code));
  for (const node of nodes) {
    if (node.children?.length) sortNodes(node.children);
  }
}

function decodeUnicode(str: string): string {
  return str.replaceAll(/\\u([0-9a-fA-F]{4})/g, (_match, p1) =>
    String.fromCharCode(Number.parseInt(p1, 16)),
  );
}

// ============ 地址值解析（支持名称/编码双向兼容） ============

/**
 * 在树数据中递归查找匹配的节点
 * @param nodes - 要搜索的节点列表
 * @param matcher - 匹配函数，返回 true 表示匹配成功
 * @returns 找到的第一个匹配节点，未找到返回 null
 */
function findNodeByMatcher(
  nodes: AddressNode[],
  matcher: (node: AddressNode) => boolean,
): AddressNode | null {
  for (const node of nodes) {
    if (matcher(node)) return node;
    if (node.children?.length) {
      const found = findNodeByMatcher(node.children, matcher);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 构建名称到节点的反向索引（缓存优化）
 * 按层级分别构建，避免不同层级同名冲突
 */
function buildNameIndex(nodes: AddressNode[]): Map<string, AddressNode> {
  const index = new Map<string, AddressNode>();
  function walk(list: AddressNode[]) {
    for (const node of list) {
      if (node.name && !index.has(node.name)) {
        index.set(node.name, node);
      }
      if (node.children?.length) walk(node.children);
    }
  }
  walk(nodes);
  return index;
}

/** 各层级的常见后缀（用于模糊匹配） */
const LEVEL_SUFFIXES: Record<string, string[]> = {
  province: ['省', '市', '自治区', '特别行政区', '壮族', '回族', '维吾尔'],
  city: ['市', '地区', '自治州', '盟'],
  district: ['区', '县', '市', '旗', '自治县'],
  town: ['镇', '乡', '街道', '街道办事处'],
};

/**
 * 将单个字段值（可能是 code 或 name）转换为标准 code
 * @param value - 字段值（编码数字/字符串 或 名称字符串）
 * @param levelKey - 层级类型
 * @param nameIndex - 名称反向索引
 * @returns 转换后的 code（字符串），无法转换返回 null
 */
function resolveFieldCode(
  value: any,
  levelKey: LevelKey,
  nameIndex: Map<string, AddressNode>,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const strVal = String(value).trim();
  if (!strVal) return null;

  // 1. 纯数字 → 直接作为 code 使用
  if (/^\d+$/.test(strVal)) return strVal;

  // 2. 在名称索引中精确查找
  const exactMatch = nameIndex.get(strVal);
  if (exactMatch) return String(exactMatch.code);

  // 3. 模糊匹配：去除常见后缀再查
  const suffixes = LEVEL_SUFFIXES[levelKey] || [];
  for (const suffix of suffixes) {
    if (strVal.endsWith(suffix)) {
      const baseName = strVal.slice(0, -suffix.length);
      const fuzzyMatch = nameIndex.get(baseName);
      if (fuzzyMatch) return String(fuzzyMatch.code);
    }
  }

  // 4. 在原始树数据中按 levelKey 过滤后搜索（处理跨层级同名问题）
  const treeNodes = props.options || rawTreeData.value;
  const matched = findNodeByMatcher(treeNodes, (node) => {
    // 只匹配相同层级的节点
    if (node.levelKey && node.levelKey !== levelKey) return false;
    return node.name === strVal ||
      (suffixes.some(s => strVal.endsWith(s) && node.name === strVal.slice(0, -s.length)));
  });
  if (matched) return String(matched.code);

  console.warn(
    `[AppAddress] 无法解析 ${levelKey} 值: "${strVal}"，既不是有效 code 也找不到匹配名称`,
  );
  return null;
}

/**
 * 解析地址值（核心转换方法，支持导出供外部调用）
 * 支持传入编码(code)、名称(name) 或混合格式
 *
 * @example
 *   // 全部使用编码
 *   resolveAddressValue({ province: '110000', city: '110100' })
 *   // 全部使用名称
 *   resolveAddressValue({ province: '北京市', city: '朝阳区' })
 *   // 混合使用
 *   resolveAddressValue({ province: '110000', city: '朝阳区' })
 */
function resolveAddressValue(
  input: Record<string, any>,
): AddressValue | null {
  if (!input || typeof input !== 'object') return null;

  const treeNodes = props.options || rawTreeData.value;
  if (treeNodes.length === 0) {
    // 数据尚未加载时尝试直接透传（等待 watch 触发后再转换）
    const hasValue = ['province', 'city', 'district', 'town', 'country'].some(
      (k) => input[k] != null && input[k] !== '',
    );
    if (!hasValue) return null;
    // 返回原始值，待数据加载后会重新触发 parseValue
    return input as AddressValue;
  }

  const nameIndex = buildNameIndex(treeNodes);
  const result: AddressValue = {};

  // 按层级顺序解析（确保父子关系正确）
  const fields: { key: keyof AddressValue; levelKey: LevelKey }[] = [
    { key: 'country', levelKey: 'country' },
    { key: 'province', levelKey: 'province' },
    { key: 'city', levelKey: 'city' },
    { key: 'district', levelKey: 'district' },
    { key: 'town', levelKey: 'town' },
  ];

  for (const { key, levelKey } of fields) {
    if (input[key] == null || input[key] === '') continue;
    const resolvedCode = resolveFieldCode(input[key], levelKey, nameIndex);
    if (resolvedCode) {
      (result as any)[key] = resolvedCode;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ============ 树操作方法 ============

function parseValue(
  val: AddressValue | null | string | undefined,
): Record<string, number | string | undefined> {
  const empty: Record<string, number | string | undefined> = {};
  if (!val) return empty;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      return empty;
    }
  }
  // 使用 resolveAddressValue 自动转换名称为编码
  const resolved = resolveAddressValue(val as Record<string, any>);
  if (!resolved) return empty;
  if (resolved.country !== undefined) empty.country = resolved.country;
  if (resolved.province !== undefined) empty.province = resolved.province;
  if (resolved.city !== undefined) empty.city = resolved.city;
  if (resolved.district !== undefined) empty.district = resolved.district;
  if (resolved.town !== undefined) empty.town = resolved.town;
  return empty;
}

function getChildren(node: AddressNode | null): Promise<AddressNode[]> {
  if (!node) {
    if (props.overseas)
      return Promise.resolve(
        rawTreeData.value.length > 0 ? rawTreeData.value : DEFAULT_FALLBACK,
      );
    return Promise.resolve(rawTreeData.value);
  }
  // 已到乡镇级，不再请求下级
  if (node.levelKey === 'town') return Promise.resolve([]);
  const children = node.children || [];
  if (children.length > 0) return Promise.resolve(children);
  const needStreetApi = props.requestStreetApi && props.level >= 4;
  if (!needStreetApi) return Promise.resolve([]);
  if (streetDataCache.has(String(node.code)))
    return Promise.resolve(streetDataCache.get(String(node.code))!);
  if (streetLoadingMap.has(String(node.code)))
    return streetLoadingMap.get(String(node.code))!;

  const parentChain = [
    String(selectedCodes.value.province ?? ''),
    String(selectedCodes.value.city ?? ''),
    String(node.code),
  ];
  const apiPromise = fetchStreetData(node, parentChain);
  streetLoadingMap.set(String(node.code), apiPromise);
  return apiPromise
    .then((data) => {
      streetDataCache.set(String(node.code), data);
      node.children = data;
      return data;
    })
    .finally(() => {
      streetLoadingMap.delete(String(node.code));
    });
}

async function fetchStreetData(
  parentNode: AddressNode,
  parentChain?: string[],
): Promise<AddressNode[]> {
  let url: string;
  const isJsonp =
    typeof props.requestStreetApi !== 'function' &&
    props.requestStreetApi?.includes('taobao.com');
  if (typeof props.requestStreetApi === 'function') {
    url = props.requestStreetApi({
      code: String(parentNode.code),
      name: parentNode.name,
    });
  } else if (isJsonp && parentChain) {
    url = props
      .requestStreetApi!.replace(
        '{0}',
        encodeURIComponent(parentChain[0] ?? ''),
      )
      .replace('{1}', encodeURIComponent(parentChain[1] ?? ''))
      .replace(
        '{2}',
        encodeURIComponent(parentChain[2] ?? String(parentNode.code)),
      );
  } else if (isJsonp) {
    url = props
      .requestStreetApi!.replace('{0}', '')
      .replace('{1}', '')
      .replace('{2}', String(parentNode.code));
  } else {
    url = props
      .requestStreetApi!.replace('{code}', encodeURIComponent(parentNode.code))
      .replace('{name}', encodeURIComponent(parentNode.name));
  }
  try {
    if (isJsonp) return await loadJsonpStreetData(url);
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    let items: any[] = Array.isArray(json)
      ? json
      : (json?.data ?? json?.list ?? json?.result ?? []);
    if (!Array.isArray(items)) items = [];
    return items.map(
      (item: any): AddressNode => ({
        code: String(item.code ?? item.value ?? item.id),
        name: item.name ?? item.label ?? item.title ?? '',
        children: [],
        levelKey: 'town',
      }),
    );
  } catch (error) {
    console.warn(
      `[AppAddress] 街道级数据加载失败 (${parentNode.name}):`,
      error,
    );
    return [];
  }
}

function loadJsonpStreetData(url: string): Promise<AddressNode[]> {
  return new Promise((resolve, reject) => {
    const callbackName = `__appAddrStreet_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    const separator = url.includes('?') ? '&' : '?';
    const jsonpUrl = `${url}${separator}callback=${callbackName}`;
    const script = document.createElement('script');
    (window as any)[callbackName] = (data: {
      result?: any[] | TDistRecord;
      success?: boolean;
    }) => {
      delete (window as any)[callbackName];
      script.remove();
      if (!data?.success || !data?.result) {
        reject(new Error('街道数据接口返回异常'));
        return;
      }
      const rawResult = data.result;
      const nodes: AddressNode[] = [];
      if (Array.isArray(rawResult)) {
        for (const item of rawResult) {
          if (!Array.isArray(item) || item.length < 2) continue;
          nodes.push({
            code: String(item[0]),
            name: decodeUnicode(String(item[1])),
            children: [],
            levelKey: 'town',
          });
        }
      } else if (typeof rawResult === 'object' && rawResult !== null) {
        for (const [code, arr] of Object.entries(rawResult)) {
          let name = '';
          if (Array.isArray(arr) && arr.length > 0)
            name = decodeUnicode(String(arr[0]));
          if (!name) name = code;
          nodes.push({ code, name, children: [], levelKey: 'town' });
        }
      }
      nodes.sort((a, b) => Number(a.code) - Number(b.code));
      resolve(nodes);
    };
    script.src = jsonpUrl;
    script.onerror = () => {
      delete (window as any)[callbackName];
      script.remove();
      reject(new Error(`加载街道数据脚本失败: ${url}`));
    };
    document.head.append(script);
  });
}

/**
 * 根据选中链路动态构建列（完全由数据驱动，直筒子市自然跳过缺失层级）
 */
async function buildDerivedColumns(): Promise<void> {
  const cols: DerivedColumn[] = [];
  const chain: AddressNode[] = [];
  const rootNodeData = props.overseas
    ? rawTreeData.value.length > 0
      ? [...rawTreeData.value]
      : [...DEFAULT_FALLBACK]
    : [...rawTreeData.value];

  if (rootNodeData.length === 0) {
    selectedNodes.value = chain;
    derivedColumns.value = [
      {
        index: 0,
        levelKey: props.overseas ? 'country' : 'province',
        label: LEVEL_LABELS[props.overseas ? 'country' : 'province'],
        parentNode: null,
        data: [],
      },
    ];
    return;
  }

  // 第一列：根节点列表
  const firstLk: LevelKey = props.overseas ? 'country' : 'province';
  cols.push({
    index: 0,
    levelKey: firstLk,
    label: LEVEL_LABELS[firstLk],
    parentNode: null,
    data: rootNodeData,
  });

  // 沿选中链路构建后续列（跳过无数据的层级以支持直筒子市）
  let currentList = rootNodeData;
  const maxDepth = props.level + (props.overseas ? 0 : LEVEL_ORDER.province);
  const levelSequence: LevelKey[] = props.overseas
    ? ['country', 'province', 'city', 'district', 'town']
    : ['province', 'city', 'district', 'town'];

  for (const lk of levelSequence) {
    if (LEVEL_ORDER[lk] >= maxDepth) break;

    const code = selectedCodes.value[lk];
    // 没有选中值 → 跳过该层级（直筒子市无区），继续检查更深层级
    if (code === undefined || code === null || String(code).length === 0)
      continue;

    const found = currentList.find((n) => String(n.code) === String(code));
    if (!found) break;

    chain.push(found);
    let children = found.children || [];
    if (children.length === 0) {
      children = await getChildren(found);
      if (children.length === 0) break;
    }

    // 子节点实际的 levelKey 决定下一列的标题
    const childLevelKey = children[0]!.levelKey ?? lk;
    if (LEVEL_ORDER[childLevelKey] >= maxDepth) break;

    cols.push({
      index: cols.length,
      levelKey: childLevelKey,
      label: LEVEL_LABELS[childLevelKey],
      parentNode: found,
      data: children,
    });
    currentList = children;
  }

  selectedNodes.value = chain;
  derivedColumns.value = cols;
}

async function buildNodeChain(): Promise<void> {
  await buildDerivedColumns();
}

async function selectNode(
  colIndex: number,
  node: AddressNode,
  _autoSelecting = false,
): Promise<void> {
  const lk = node.levelKey ?? ('district' as LevelKey);
  if (!lk) return;

  const isLastTab = colIndex >= derivedColumns.value.length - 1;
  let children: AddressNode[] = [];
  if (node.children?.length) {
    children = node.children;
  } else if (
    !isLastTab &&
    props.level >= 4 &&
    lk !== 'town' &&
    lk !== 'country'
  ) {
    children = await getChildren(node);
  }

  selectedCodes.value[lk] = node.code;
  const curOrder = LEVEL_ORDER[lk] ?? 0;
  for (const [key, order] of Object.entries(LEVEL_ORDER)) {
    if ((order ?? 0) > curOrder) delete selectedCodes.value[key];
  }

  // 先重建列，再用重建后的实际数据做决策
  await buildDerivedColumns();

  // 用重建后的实际列数判断：没新增列说明到底了
  const newColCount = derivedColumns.value.length;
  const reallyIsLast = colIndex + 1 >= newColCount;
  const hasNewColumnData =
    !reallyIsLast && (derivedColumns.value[colIndex + 1]?.data.length ?? 0) > 0;

  if (reallyIsLast || (!hasNewColumnData && children.length === 0)) {
    if (!_autoSelecting) closePopup();
    emitChange();
    return;
  }

  // 单子节点自动选择并定位到下一级（不 emitChange 避免 watcher 竞态重置 derivedColumns）
  if (
    !_autoSelecting &&
    hasNewColumnData &&
    derivedColumns.value[colIndex + 1]!.data.length === 1
  ) {
    const nextColIndex = colIndex + 1;
    activeColumn.value = nextColIndex;
    await selectNode(
      nextColIndex,
      derivedColumns.value[colIndex + 1]!.data[0]!,
      true,
    );
    emitChange();
    return;
  }

  activeColumn.value = Math.min(colIndex + 1, newColCount - 1);
  searchText.value = '';
  emitChange();
}

function clickSelectedTag(index: number): void {
  if (visible.value) {
    activeColumn.value = Math.min(index + 1, visibleColumns.value.length - 1);
    searchText.value = '';
  } else {
    openPopup().then(() => {
      activeColumn.value = Math.min(index + 1, visibleColumns.value.length - 1);
      searchText.value = '';
    });
  }
}

function handleTabClick(col: DerivedColumn): void {
  if (col.data.length === 0 && col.index > 0) return;
  activeColumn.value = col.index;
  searchText.value = '';
}

function handleClear(e: Event): void {
  e.stopPropagation();
  resetSelection();
  emitChange();
}

function resetSelection(): void {
  selectedCodes.value = {};
  selectedNodes.value = [];
  derivedColumns.value = [];
  activeColumn.value = 0;
  searchText.value = '';
}

function isSelectedInActiveColumn(node: AddressNode): boolean {
  const col = visibleColumns.value[activeColumn.value];
  if (!col) return false;
  return selectedCodes.value[col.levelKey] === node.code;
}

function emitChange(): void {
  const getValue = (): AddressValue | null => {
    if (selectedNodes.value.length === 0) return null;
    const v: AddressValue = {};
    const sc = selectedCodes.value;
    if (sc.country !== undefined) v.country = sc.country;
    if (sc.province !== undefined) v.province = sc.province;
    if (sc.city !== undefined) v.city = sc.city;
    if (sc.district !== undefined) v.district = sc.district;
    if (sc.town !== undefined) v.town = sc.town;
    // 拼接完整地区名称
    v.full_region = selectedNodes.value.map(n => n.name).join('/');
    return Object.keys(v).length > 0 ? v : null;
  };
  const val = getValue();
  emit('update:modelValue', val);
  emit('update:value', val);
  emit('change', val, [...selectedNodes.value]);
}

// ============ 弹层控制 ============
async function openPopup(): Promise<void> {
  if (props.disabled) return;
  if (!isReady.value) {
    await fetchAddressData();
  }
  visible.value = true;
  if (derivedColumns.value.length === 0) {
    await buildDerivedColumns();
  }
  activeColumn.value = Math.min(
    selectedNodes.value.length,
    Math.max(0, visibleColumns.value.length - 1),
  );
  searchText.value = '';
}
function closePopup(): void {
  visible.value = false;
  searchText.value = '';
}
function togglePopup(): void {
  if (visible.value) closePopup();
  else openPopup();
}

function handleClickOutside(e: MouseEvent): void {
  const target = e.target as Node;
  if (
    visible.value &&
    triggerRef.value &&
    popupRef.value &&
    !triggerRef.value.contains(target) &&
    !popupRef.value.contains(target)
  ) {
    closePopup();
  }
}

onMounted(async () => {
  document.addEventListener('mousedown', handleClickOutside);
  if (!props.options) {
    await fetchAddressData();
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});

watch(
  () => props.modelValue ?? props.value,
  async (val) => {
    selectedCodes.value = parseValue(val);
    if (isReady.value || props.overseas) {
      await buildNodeChain();

      // 回显时自动补全 full_region（仅当不一致时才 emit，避免无效触发）
      if (selectedNodes.value.length > 0) {
        const expectedFullRegion = selectedNodes.value.map(n => n.name).join('/');
        const currentFullRegion =
          val && typeof val === 'object' && !Array.isArray(val)
            ? (val as Record<string, any>).full_region || ''
            : '';
        if (currentFullRegion !== expectedFullRegion) {
          emitChange();
        }
      }
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => props.options,
  async (newOptions) => {
    if (newOptions) {
      await buildNodeChain();
    }
  },
  { deep: true },
);

watch(isReady, async (ready) => {
  if (ready) {
    await buildNodeChain();
  }
});

defineExpose({ open: openPopup, close: closePopup, reload: fetchAddressData, resolveAddressValue });
</script>

<template>
  <div
    class="app-address"
    :class="[
      `app-address--${size}`,
      { 'app-address--disabled': disabled },
      props.class,
    ]"
    :style="style"
  >
    <!-- 触发器 -->
    <div
      ref="triggerRef"
      class="app-address__trigger"
      :class="{ 'app-address__trigger--open': visible }"
      @click="togglePopup"
    >
      <span class="app-address__placeholder" v-if="!displayText">{{
        placeholder
      }}</span>
      <span v-else class="app-address__value">
        <template v-for="(node, idx) in selectedNodes" :key="idx">
          <span v-if="idx > 0" class="app-address__separator">/</span>
          <span
            class="app-address__tag"
            :class="{ 'app-address__tag--clickable': !disabled }"
            @click.stop="clickSelectedTag(idx)"
            >{{ node.name }}</span
          >
        </template>
      </span>
      <span
        v-if="allowClear && displayText && !disabled"
        class="app-address__clear"
        @mousedown="(e: Event) => e.preventDefault()"
        @click="handleClear"
      >
        <svg
          viewBox="0 0 1024 1024"
          width="1em"
          height="1em"
          fill="currentColor"
        >
          <path
            d="M563.7 512l308.6-308.6c14.5-14.5 14.5-38.1 0-52.6s-38.1-14.5-52.6 0L511.1 459.4 202.5 150.8c-14.5-14.5-38.1-14.5-52.6 0s-14.5 38.1 0 52.6L458.5 512 149.9 820.6c-14.5 14.5-14.5 38.1 0 52.6s38.1 14.5 52.6 0L511.1 564.6l308.6 308.6c14.5 14.5 38.1 14.5 52.6 0s14.5-38.1 0-52.6L563.7 512z"
          />
        </svg>
      </span>
      <span class="app-arrow" :class="{ 'app-arrow--up': visible }">
        <svg
          viewBox="0 0 1024 1024"
          width="1em"
          height="1em"
          fill="currentColor"
        >
          <path
            d="M840.4 300H183.6c-19.7 0-30.7 20.8-18.5 35l328.4 380.8c9.4 10.9 27.5 10.9 37 0L858.9 335c12.2-14.2 1.2-35-18.5-35z"
          />
        </svg>
      </span>
      <span v-if="loading" class="app-address__loading">
        <svg
          class="app-spin"
          viewBox="0 0 1024 1024"
          width="1em"
          height="1em"
          fill="currentColor"
        >
          <path
            d="M512 64a32 32 0 0132 32v192a32 32 0 01-64 0V96A32 32 0 01512 64zm288 128a32 32 0 110 64H608a32 32 0 010-64h192zm128 160a32 32 0 0132 32v192a32 32 0 01-64 0V384a32 32 0 0132-32zM512 896a32 32 0 01-32-32V672a32 32 0 1164 0v192a32 32 0 01-32 32z"
          />
        </svg>
      </span>
    </div>

    <!-- 弹出层 -->
    <Transition name="app-address-fade">
      <div
        v-if="visible"
        ref="popupRef"
        class="app-address__popup"
        :class="{ 'app-address__popup--fixed': popupFixedWidth }"
      >
        <div v-if="loading" class="app-address__loading-wrap">
          <svg
            class="app-spin app-spin--lg"
            viewBox="0 0 1024 1024"
            width="24"
            height="24"
            fill="#1677ff"
          >
            <path
              d="M512 64a32 32 0 0132 32v192a32 32 0 01-64 0V96A32 32 0 01512 64zm288 128a32 32 0 110 64H608a32 32 0 010-64h192zm128 160a32 32 0 0132 32v192a32 32 0 01-64 0V384a32 32 0 0132-32zM512 896a32 32 0 01-32-32V672a32 32 0 1164 0v192a32 32 0 01-32 32z"
            />
          </svg>
          <span>加载地址数据...</span>
        </div>
        <div
          v-else-if="loadError || (!isReady && !options)"
          class="app-address__error"
        >
          <span>地址数据加载失败</span>
          <button
            class="app-address__btn app-address__btn--link"
            @click="fetchAddressData()"
          >
            重试
          </button>
        </div>

        <template v-else>
          <!-- 层级导航 Tab -->
          <div class="app-address__tabs" v-if="visibleColumns.length > 0">
            <div
              v-for="col in visibleColumns"
              :key="col.index"
              class="app-address__tab"
              :class="{
                'app-address__tab--active': col.index === activeColumn,
                'app-address__tab--filled':
                  selectedCodes[col.levelKey] !== undefined,
                'app-address__tab--disabled':
                  col.data.length === 0 && col.index > 0,
              }"
              @click="handleTabClick(col)"
            >
              {{ col.label }}
            </div>
          </div>

          <!-- 搜索框 -->
          <div v-if="showSearch" class="app-address__search">
            <svg
              class="app-address__search-icon"
              viewBox="0 0 1024 1024"
              width="1em"
              height="1em"
              fill="currentColor"
            >
              <path
                d="M909.6 854.5L649.9 594.8C690.2 542.7 712 479 712 412c0-80.2-31.3-155.4-87.9-212.1-56.6-56.7-132-87.9-212.1-87.9s-155.5 31.3-212.1 87.9C143.2 256.5 112 331.8 112 412c0 80.1 31.3 155.5 87.9 212.1C256.5 680.8 331.8 712 412 712c67 0 130.6-21.8 182.7-62l259.7 259.6c3.2 3.2 8.4 3.2 11.6 0l43.6-43.5c3.2-3.2 3.2-8.4 0-11.6zM570.4 570.4C528 612.7 471.8 636 412 636s-116-23.3-158.4-65.6C211.3 528 188 471.8 188 412s23.3-116.1 65.6-158.4C296 211.3 352.2 188 412 188s116.1 23.2 158.4 65.6S636 352.2 636 412s-23.3 116.1-65.6 158.4z"
              />
            </svg>
            <input
              v-model="searchText"
              type="text"
              class="app-address__search-input"
              :placeholder="`搜索${visibleColumns[activeColumn]?.label || '地址'}`"
            />
          </div>

          <!-- 选项列表（支持横排模式） -->
          <div
            class="app-address__list-wrap"
            :class="{
              'app-address__list-wrap--horizontal': listMode === 'horizontal',
            }"
          >
            <div
              class="app-address__list"
              :key="activeColumn"
              :class="{
                'app-address__list--inline': listMode === 'horizontal',
              }"
            >
              <div
                v-for="node in activeColumnData"
                :key="node.code"
                class="app-address__item"
                :class="{
                  'app-address__item--selected': isSelectedInActiveColumn(node),
                  'app-address__item--hovered':
                    hoveredNode?.colIndex === activeColumn &&
                    hoveredNode?.node.code === node.code,
                  'app-address__item--inline': listMode === 'horizontal',
                }"
                @mouseenter="hoveredNode = { colIndex: activeColumn, node }"
                @mouseleave="hoveredNode = null"
                @click="selectNode(activeColumn, node)"
              >
                {{ node.name }}
                <span
                  v-if="node.children?.length && listMode !== 'horizontal'"
                  class="app-address__item-arrow"
                  >›</span
                >
              </div>
              <div
                v-if="activeColumnData.length === 0"
                class="app-address__empty"
              >
                {{ searchText ? '无匹配结果' : '暂无数据' }}
              </div>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="app-address__footer">
            <button
              class="app-address__btn app-address__btn--text"
              @click="
                resetSelection();
                emitChange();
              "
            >
              清空
            </button>
            <div
              class="app-address__selected-info"
              v-if="selectedNodes.length > 0"
            >
              已选：<span v-for="(node, idx) in selectedNodes" :key="idx"
                ><span v-if="idx > 0">/</span>{{ node.name }}</span
              >
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@keyframes ad-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes ad-popup-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes ad-tab-slide {
  from {
    width: 0;
  }

  to {
    width: 70%;
  }
}

@keyframes ad-item-check {
  0% {
    transform: scale(0) rotate(-45deg);
  }

  100% {
    transform: scale(1) rotate(0deg);
  }
}

.app-address {
  --ad-primary: #1677ff;
  --ad-primary-light: rgb(22 119 255 / 6%);
  --ad-primary-lighter: rgb(22 119 255 / 10%);
  --ad-border: #e5e7eb;
  --ad-border-focus: var(--ad-primary);
  --ad-text: #1f2937;
  --ad-text-secondary: #9ca3af;
  --ad-bg: #fff;
  --ad-surface: #fafbfc;
  --ad-radius: 8px;
  --ad-radius-sm: 6px;
  --ad-shadow: 0 8px 30px rgb(0 0 0 / 12%), 0 2px 8px rgb(0 0 0 / 6%);

  position: relative;
  display: inline-block;
  width: 100%;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    sans-serif;
  font-size: 14px;
}

.app-address--small .app-address__trigger {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 4px;
}

.app-address--middle .app-address__trigger {
  min-height: 34px;
  padding: 6px 12px;
  font-size: 14px;
  border-radius: var(--ad-radius-sm);
}

.app-address--large .app-address__trigger {
  min-height: 42px;
  padding: 8px 14px;
  font-size: 15px;
  border-radius: var(--ad-radius);
}

/* 触发器 */
.app-address__trigger {
  position: relative;
  box-sizing: border-box;
  display: flex;
  gap: 4px;
  align-items: center;
  width: 100%;
  cursor: pointer;
  background: var(--ad-bg);
  border: 1.5px solid var(--ad-border);
  border-radius: var(--ad-radius-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-address__trigger:hover:not(.app-address--disabled .app-address__trigger) {
  border-color: var(--ad-border-focus);
  box-shadow: 0 0 0 3px rgb(22 119 255 / 8%);
}

.app-address__trigger--open {
  border-color: var(--ad-border-focus);
  box-shadow:
    0 0 0 3px rgb(22 119 255 / 10%),
    0 4px 12px rgb(0 0 0 / 8%);
}

.app-address--disabled .app-address__trigger {
  color: var(--ad-text-secondary);
  cursor: not-allowed;
  background: #f9fafb;
  border-color: #e5e7eb;
  box-shadow: none;
}

/* 占位符 & 值 */
.app-address__placeholder {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ad-text-secondary);
  white-space: nowrap;
}

.app-address__value {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  overflow: hidden;
}

.app-address__separator {
  flex-shrink: 0;
  margin: 0 3px;
  color: #d1d5db;
}

.app-address__tag {
  flex-shrink: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  color: var(--ad-text);
  white-space: nowrap;
}

.app-address__tag--clickable {
  padding: 1px 4px;
  margin: -1px;
  color: var(--ad-text);
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.app-address__tag--clickable:hover {
  background: var(--ad-primary-lighter);
}

/* 清除按钮 */
.app-address__clear {
  display: none;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--ad-text-secondary);
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.15s ease;
}

.app-address__clear:hover {
  color: #ef4444;
  background: rgb(239 68 68 / 10%);
}

.app-address__trigger:hover .app-address__clear {
  display: flex;
}

/* 下拉箭头 */
.app-arrow {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  color: var(--ad-text-secondary);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-arrow--up {
  color: var(--ad-primary);
  transform: rotate(180deg);
}

/* Loading */
.app-address__loading {
  display: flex;
  align-items: center;
  margin-left: 4px;
  color: var(--ad-primary);
  animation: ad-spin 0.8s linear infinite;
}

/* 弹出层 */
.app-address__popup {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1050;
  display: flex;
  flex-direction: column;
  min-width: 400px;
  max-width: 520px;
  overflow: hidden;
  background: var(--ad-bg);
  border: 1px solid rgb(0 0 0 / 5%);
  border-radius: var(--ad-radius);
  box-shadow: var(--ad-shadow);
  animation: ad-popup-in 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-address__popup--fixed {
  width: 450px;
}

/* 加载 / 错误状态 */
.app-address__loading-wrap,
.app-address__error {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  font-size: 13px;
  color: var(--ad-text-secondary);
}

.app-address__error button {
  padding: 4px 8px;
  font-size: 13px;
  color: var(--ad-primary);
  cursor: pointer;
  background: none;
  border-bottom: 1.5px dashed var(--ad-primary);
  border-radius: 0;
  transition: all 0.15s ease;
}

.app-address__error button:hover {
  background: var(--ad-primary-lighter);
}

/* Tab 导航 */
.app-address__tabs {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  background: linear-gradient(to bottom, #fcfdff, #f8f9fb);
  border-bottom: 1px solid #eff0f2;
}

.app-address__tab {
  position: relative;
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ad-text-secondary);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  border-bottom: 2.5px solid transparent;
  transition: all 0.2s ease;
}

.app-address__tab::after {
  position: absolute;
  bottom: -1px;
  left: 50%;
  width: 0;
  height: 2.5px;
  content: '';
  background: var(--ad-primary);
  border-radius: 2px;
  transform: translateX(-50%);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-address__tab:hover:not(.app-address__tab--disabled) {
  color: var(--ad-primary);
}

.app-address__tab:hover:not(.app-address__tab--disabled)::after {
  width: 40%;
}

.app-address__tab--active {
  color: var(--ad-primary);
}

.app-address__tab--active::after {
  width: 70%;
  animation: ad-tab-slide 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-address__tab--filled {
  color: var(--ad-text);
}

.app-address__tab--disabled {
  color: #d1d5db;
  cursor: not-allowed;
  opacity: 0.6;
}

/* 搜索框 */
.app-address__search {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  background: var(--ad-surface);
  border-bottom: 1px solid #eff0f2;
}

.app-address__search-icon {
  flex-shrink: 0;
  font-size: 15px;
  color: var(--ad-text-secondary);
  opacity: 0.7;
}

.app-address__search-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--ad-text);
  outline: none;
  background: var(--ad-bg);
  border: 1.5px solid transparent;
  border-radius: var(--ad-radius-sm);
  transition: all 0.2s ease;
}

.app-address__search-input:focus {
  background: #fff;
  border-color: var(--ad-primary);
  box-shadow: 0 0 0 3px rgb(22 119 255 / 10%);
}

.app-address__search-input::placeholder {
  color: #c4c9d4;
}

/* 选项列表 */
.app-address__list-wrap {
  flex: 1;
  min-height: 80px;
  max-height: 260px;
  overflow-y: auto;
}

.app-address__list {
  padding: 4px;
}

/* 横排模式容器 */
.app-address__list-wrap--horizontal {
  max-height: 200px;
  overflow-y: auto;
}

.app-address__list--inline {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 6px;
  padding: 6px 8px;
}

.app-address__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin: 2px 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ad-text);
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.15s ease;
}

.app-address__item:hover {
  color: var(--ad-primary);
  background: var(--ad-primary-light);
  transform: translateX(2px);
}

/* 横排项样式 */
.app-address__item--inline {
  flex-shrink: 0;
  padding: 1px 8px;
  margin: 0;
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  transform: none;
}

.app-address__item--inline:hover {
  background: var(--ad-primary-lighter);
  border-color: var(--ad-primary);
  transform: none;
}

.app-address__item--inline.app-address__item--selected {
  background: var(--ad-primary-light);
  border-color: var(--ad-primary);
}

.app-address__item--selected {
  position: relative;
  font-weight: 600;
  color: var(--ad-primary);
  background: var(--ad-primary-light);
}

.app-address__item--selected .app-address__item-arrow {
  margin-left: auto;
}

.app-address__item--selected::before {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  font-size: 11px;
  color: #fff;
  content: '\2713';
  background: var(--ad-primary);
  border-radius: 50%;
  animation: ad-item-check 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.app-address__item-arrow {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 13px;
  color: #c4c9d4;
  transition: all 0.15s ease;
}

.app-address__item:hover .app-address__item-arrow {
  color: var(--ad-primary);
  transform: translateX(2px);
}

.app-address__empty {
  padding: 32px 16px;
  font-size: 13px;
  color: var(--ad-text-secondary);
  text-align: center;
}

/* 底部操作栏 */
.app-address__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(to bottom, #f8f9fb, #fdfdfd);
  border-top: 1px solid #eff0f2;
}

.app-address__btn {
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ad-text-secondary);
  cursor: pointer;
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: var(--ad-radius-sm);
  transition: all 0.15s ease;
}

.app-address__btn:hover {
  color: #ef4444;
  background: rgb(239 68 68 / 5%);
  border-color: #fecaca;
}

.app-address__selected-info {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ad-text-secondary);
  white-space: nowrap;
}

.app-address__selected-info span {
  font-weight: 500;
  color: var(--ad-text);
}

/* 动画 */
.app-address-fade-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-address-fade-leave-active {
  transition: opacity 0.15s ease;
}

.app-address-fade-enter-from,
.app-address-fade-leave-to {
  opacity: 0;
}

.app-address-fade-enter-from {
  transform: translateY(-6px) scale(0.97);
  transform-origin: top center;
}

/* 滚动条 */
.app-address__list-wrap::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.app-address__list-wrap::-webkit-scrollbar-track {
  background: transparent;
}

.app-address__list-wrap::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.app-address__list-wrap::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* ========== CSS 变量 ========== */
</style>
