/**
 * 源代码模式 CodeMirror 6 编辑器工厂（动态加载，独立分包）
 *
 * 职责：把源码模式的纯文本 textarea 升级为带语法高亮/行号/查找替换的
 * CodeMirror 6 实例；对外数据流与旧 textarea 等价（onChange 全文回调，
 * 由 index.vue 复用原 onSourceInput 语义同步 content 并 emit）。
 * 主题走 hsl(var(--*)) CSS 变量，自动适配应用的明暗模式。
 *
 * AI 辅助预留（刻意不做全套 vibe coding，只服务「AI 写、用户看着改」）：
 * 后续 AI 面板经 app-editor 的 defineExpose(sourceAi) 拿到本 api：
 * - getCode()/getStats()        读取当前源码与规模（AI 面板展示上下文）
 * - getSelection()              读取选中片段（AI 只改用户选中的部分）
 * - insertCode(text, opts)      光标/头/尾插入片段；默认「选中插入结果」，
 *                               用户立刻看见 AI 写了什么并手动微调
 * - appendCode(text)            文档末尾追加（流式输出按 chunk 循环调用）
 * - replaceSelection(text)      替换选中片段
 * - setCode(text)               整体替换（AI 重写后应用）
 * - clear()/focus()/destroy()
 * - locateRange(from, to)/clearLocate()  双栏同步定位高亮（高亮 + 选中 +
 *                               滚动，只 dispatch 不 focus；区间随文档编辑自动 map）
 * - locateElementAt(pos, tagName)    由命中点沿语法树上浮到目标元素整体高亮
 * 所有写入均为单事务（可整体撤销）+ scrollIntoView，保证「AI 改了哪一眼可见」。
 * 流式说明：appendCode 每次 dispatch 一个 chunk 即可，无需额外流式协议。
 */

let modulesPromise = null;

/** 动态加载 CodeMirror 相关包（仅首次进入源码模式时下载，独立 chunk） */
function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import('codemirror'),
      import('@codemirror/lang-html'),
      import('@codemirror/language'),
      import('@codemirror/search'),
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@lezer/highlight'),
    ]).then(([core, langHtml, language, searchMod, state, view, lezer]) => ({
      basicSetup: core.basicSetup,
      html: langHtml.html,
      HighlightStyle: language.HighlightStyle,
      syntaxHighlighting: language.syntaxHighlighting,
      syntaxTree: language.syntaxTree,
      search: searchMod.search,
      EditorState: state.EditorState,
      StateEffect: state.StateEffect,
      StateField: state.StateField,
      // 注意：tags 导出自 @lezer/highlight（@codemirror/language 并不转出它）
      tags: lezer.tags,
      EditorView: view.EditorView,
      Decoration: view.Decoration,
      ViewPlugin: view.ViewPlugin,
      keymap: view.keymap,
      placeholder: view.placeholder,
    }));
  }
  return modulesPromise;
}

/** 编辑器主题：全部走 CSS 变量，明暗模式自动跟随 */
function buildTheme(EditorView) {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '12px',
      backgroundColor: 'transparent',
      color: 'hsl(var(--foreground))',
    },
    '.cm-scroller': {
      overflow: 'auto',
      lineHeight: '1.7',
      fontFamily:
        "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    },
    '.cm-content': {
      caretColor: 'hsl(var(--primary))',
      paddingBottom: '24px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'hsl(var(--muted-foreground) / 70%)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'hsl(var(--muted) / 45%)' },
    '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--muted) / 45%)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'hsl(var(--primary) / 22%) !important',
    },
    '.cm-cursor': { borderLeftColor: 'hsl(var(--primary))' },
    '.cm-searchMatch': { backgroundColor: 'hsl(var(--primary) / 25%)' },
    '.cm-searchMatch-selected': { backgroundColor: 'hsl(var(--primary) / 55%)' },
    // 双栏模式选中同步高亮（左侧元素选中 → 右侧代码区间定位，不进选区）
    '.cm-sync-match': {
      backgroundColor: 'hsl(var(--primary) / 18%)',
      outline: '1px solid hsl(var(--primary) / 60%)',
      borderRadius: '3px',
    },
    '.cm-panels': {
      backgroundColor: 'hsl(var(--card))',
      color: 'hsl(var(--foreground))',
      borderColor: 'hsl(var(--border))',
    },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid hsl(var(--border))' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid hsl(var(--border))' },
    // 搜索面板定制：统一为本项目风格（输入/按钮/复选框/关闭），
    // 全部走 CSS 变量，无框架依赖；变量缺失时自动回落 CodeMirror 默认
    '.cm-panel.cm-search': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px 6px',
      padding: '6px 32px 6px 8px',
      fontFamily: 'inherit',
      fontSize: '12px',
    },
    '.cm-panel.cm-search .cm-textfield': {
      minWidth: '140px',
      padding: '3px 8px',
      fontSize: '12px',
      color: 'hsl(var(--foreground))',
      backgroundColor: 'hsl(var(--background))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      outline: 'none',
    },
    '.cm-panel.cm-search .cm-textfield:focus': {
      borderColor: 'hsl(var(--primary))',
      boxShadow: '0 0 0 2px hsl(var(--primary) / 15%)',
    },
    '.cm-panel.cm-search .cm-button': {
      backgroundImage: 'none',
      backgroundColor: 'hsl(var(--muted))',
      color: 'hsl(var(--foreground))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      padding: '3px 10px',
      fontSize: '12px',
      cursor: 'pointer',
    },
    '.cm-panel.cm-search .cm-button:hover': { backgroundColor: 'hsl(var(--accent))' },
    '.cm-panel.cm-search label': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      color: 'hsl(var(--muted-foreground))',
      whiteSpace: 'nowrap',
    },
    '.cm-panel.cm-search input[type=checkbox]': {
      accentColor: 'hsl(var(--primary))',
      margin: '0',
    },
    '.cm-panel.cm-search [name=close]': {
      position: 'absolute',
      top: '4px',
      right: '4px',
      padding: '0 6px',
      fontSize: '16px',
      lineHeight: '1.2',
      color: 'hsl(var(--muted-foreground))',
      backgroundColor: 'transparent',
      border: 'none',
      cursor: 'pointer',
    },
    '.cm-panel.cm-search [name=close]:hover': { color: 'hsl(var(--foreground))' },
    '.cm-tooltip': {
      backgroundColor: 'hsl(var(--card))',
      color: 'hsl(var(--foreground))',
      border: '1px solid hsl(var(--border))',
    },
  });
}

/** 语法高亮：颜色引用 CSS 变量（明暗模式各自定义，缺省值兜底） */
function buildHighlight(tags, HighlightStyle) {
  return HighlightStyle.define([
    { tag: tags.angleBracket, color: 'var(--cm-bracket, #cf222e)' },
    { tag: tags.tagName, color: 'var(--cm-tag, #116329)' },
    { tag: tags.attributeName, color: 'var(--cm-attr, #0550ae)' },
    { tag: [tags.attributeValue, tags.string], color: 'var(--cm-string, #0a3069)' },
    { tag: tags.comment, color: 'var(--cm-comment, #6e7781)' },
  ]);
}

// ---------------------------------------------------------------------------
// 配对标签（源码模式专用），以 <div>...</div> 这种开闭配对为核心：
// 1. 光标位于开/闭标签的任意位置（名字/属性/尖括号之间）→ 两端标签名同时
//    高亮（.cm-tag-pair）；光标位于元素内容区 → 高亮包住它的最近元素的
//    开/闭标签名；
// 2. 修改标签名自动联动另一端（transactionFilter 追加一条事务，一次编辑两端生效）；
// 3. 跳转：Ctrl-m / Alt-m，或 Ctrl/Cmd+点击标签（macOS 的 Cmd+M 被系统
//    占用为最小化窗口，页面无法拦截，故不用 Mod-m）。
// 只处理「标签名」编辑，属性值/结构性改动的联动不介入，避免误伤。
// 依赖运行时注入的 CodeMirror 模块（不做顶层 import，保持懒加载分包）。
// ---------------------------------------------------------------------------
export function createTagPairSupport({
  syntaxTree,
  EditorState,
  Decoration,
  ViewPlugin,
  EditorView,
  keymap,
}) {
  const TAG_NODES = new Set(['OpenTag', 'CloseTag', 'SelfClosingTag']);

  /**
   * 光标处的标签节点（OpenTag/CloseTag/SelfClosingTag 任意位置均可命中）。
   * 双侧探测：resolveInner(pos,-1) 在标签起始边界会优先返回「结束于该点」的
   * 尖括号节点，先试 -1 再试 +1 才能稳定命中。
   */
  const tagNodeAt = (state, pos) => {
    const tree = syntaxTree(state);
    for (const side of [-1, 1]) {
      let node = tree.resolveInner(pos, side);
      while (node && !TAG_NODES.has(node.name)) node = node.parent;
      if (node && node.from <= pos && pos <= node.to) return node;
    }
    return null;
  };

  /** 取标签节点下的 TagName 子节点 */
  const nameOf = (tagNode) => {
    for (let ch = tagNode.firstChild; ch; ch = ch.nextSibling) {
      if (ch.name === 'TagName') return ch;
    }
    return null;
  };

  /** 由开/闭标签节点找配对端：{ selfName, otherName, selfIsOpen } */
  const pairTagNames = (tag) => {
    if (!tag || (tag.name !== 'OpenTag' && tag.name !== 'CloseTag')) return null;
    const element = tag.parent;
    if (!element || element.name !== 'Element') return null;
    const otherType = tag.name === 'OpenTag' ? 'CloseTag' : 'OpenTag';
    let other = null;
    for (let ch = element.firstChild; ch; ch = ch.nextSibling) {
      if (ch.name === otherType) {
        other = ch;
        break;
      }
    }
    if (!other) return null;
    const selfName = nameOf(tag);
    const otherName = nameOf(other);
    if (!selfName || !otherName) return null;
    return { selfName, otherName, selfIsOpen: tag.name === 'OpenTag' };
  };

  /**
   * 光标处配对信息 { selfName, otherName }；无配对返回 null。
   * 优先标签本体；否则取包住光标的最近 Element 的开/闭标签（内容区场景，
   * 跳转永远去另一端，高亮两端）。
   */
  const pairAt = (state, pos) => {
    const tag = tagNodeAt(state, pos);
    if (tag) {
      if (tag.name === 'SelfClosingTag') return null;
      return pairTagNames(tag);
    }
    const tree = syntaxTree(state);
    let node = tree.resolveInner(pos, -1);
    while (node && node.name !== 'Element') node = node.parent;
    if (!node) return null;
    let open = null;
    let close = null;
    for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
      if (!open && ch.name === 'OpenTag') open = ch;
      else if (!close && ch.name === 'CloseTag') close = ch;
    }
    if (!open || !close) return null;
    const selfName = nameOf(open);
    const otherName = nameOf(close);
    if (!selfName || !otherName) return null;
    return { selfName, otherName, selfIsOpen: true };
  };

  // 1) 两端标签名同步高亮
  const highlight = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.compute(view);
      }

      update(update) {
        if (update.selectionSet || update.docChanged) {
          this.decorations = this.compute(update.view);
        }
      }

      compute(view) {
        const pair = pairAt(view.state, view.state.selection.main.head);
        if (!pair) return Decoration.none;
        const mark = Decoration.mark({ class: 'cm-tag-pair' });
        return Decoration.set(
          [
            mark.range(pair.selfName.from, pair.selfName.to),
            mark.range(pair.otherName.from, pair.otherName.to),
          ],
          true,
        );
      }
    },
    { decorations: (v) => v.decorations },
  );

  // 2) 改标签名联动另一端（单次用户编辑，两端一起变）
  const renameSync = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    let fix = null;
    try {
      tr.changes.iterChanges((fromA, toA) => {
        if (fix) return;
        // 双侧探测定位包含本次编辑的 TagName
        let node = null;
        for (const side of [-1, 1]) {
          let n = syntaxTree(tr.startState).resolveInner(fromA, side);
          while (n && n.name !== 'TagName') n = n.parent;
          // 编辑必须完整落在原标签名内，避免删除/粘贴结构时误联动
          if (n && n.from <= fromA && n.to >= toA) {
            node = n;
            break;
          }
        }
        if (!node) return;
        const pair = pairTagNames(node.parent);
        if (!pair) return;
        const otherName = pair.otherName;
        const nFrom = tr.changes.mapPos(node.from);
        const nTo = tr.changes.mapPos(node.to);
        const newName = tr.state.doc.sliceString(nFrom, nTo);
        if (!/^[A-Za-z][A-Za-z0-9:-]*$/.test(newName)) return;
        const pFrom = tr.changes.mapPos(otherName.from);
        const pTo = tr.changes.mapPos(otherName.to);
        if (tr.state.doc.sliceString(pFrom, pTo) === newName) return;
        fix = { from: pFrom, to: pTo, insert: newName };
      });
    } catch {
      return tr;
    }
    // sequential: true 关键——fix 的坐标基于「已应用本次编辑的新文档」，
    // 不设它时 resolveTransaction 会按原文档长度解析坐标导致联动失效
    return fix ? [tr, { changes: fix, sequential: true }] : tr;
  });

  // 3) 跳转到配对端（选中对方标签名，可接着改名）
  const jumpToPair = (view) => {
    const pair = pairAt(view.state, view.state.selection.main.head);
    if (!pair) return false;
    view.dispatch({
      selection: { anchor: pair.otherName.from, head: pair.otherName.to },
      scrollIntoView: true,
    });
    return true;
  };

  // Ctrl/Cmd+点击标签也可跳转（比快捷键更直观的发现路径）
  const jumpClick = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!event.metaKey && !event.ctrlKey) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (typeof pos !== 'number') return false;
      const pair = pairAt(view.state, pos);
      if (!pair) return false;
      event.preventDefault();
      view.dispatch({
        selection: { anchor: pair.otherName.from, head: pair.otherName.to },
        scrollIntoView: true,
      });
      return true;
    },
  });

  // macOS 上 Ctrl+M 会被系统当作回车（CR，^M）处理，浏览器不会给出
  // Ctrl-m 组合键，故仅在非 macOS 绑定 Ctrl-m；Alt-m 全平台可用
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  const jumpKeys = [
    ...(isMac ? [] : [{ key: 'Ctrl-m', run: jumpToPair }]),
    { key: 'Alt-m', run: jumpToPair },
  ];

  return {
    jumpToPair,
    pairAt,
    extensions: [highlight, renameSync, jumpClick, keymap.of(jumpKeys)],
  };
}

/**
 * 创建源码编辑器实例。
 * @param {object} options
 * @param {HTMLElement} options.host 挂载容器（由 index.vue 提供 ref）
 * @param {string} [options.doc] 初始文档（已格式化的 HTML）
 * @param {string} [options.placeholderText] 空文档占位文本
 * @param {(value: string) => void} [options.onChange] 文档变化回调（全文）
 * @param {() => void} [options.onApply] “完成并应用”回调（Ctrl/Cmd+S、Ctrl/Cmd+Enter）
 * @returns {Promise<{ view: object, api: object }>}
 */
export async function createSourceCodeEditor({
  host,
  doc = '',
  placeholderText = '',
  onChange,
  onApply,
}) {
  if (!host) throw new Error('[source-editor] host is required');
  const {
    basicSetup,
    html,
    HighlightStyle,
    syntaxHighlighting,
    syntaxTree,
    search,
    EditorState,
    StateEffect,
    StateField,
    tags,
    EditorView,
    Decoration,
    ViewPlugin,
    keymap,
    placeholder,
  } = await loadModules();

  // ---------------------------------------------------------------------------
  // 双栏同步定位高亮：StateEffect + StateField 承载区间 Decoration，
  // 随文档 changes 自动 map（编辑他处时跟随文本漂移），与用户选区互不干扰。
  // ---------------------------------------------------------------------------
  const setSyncEffect = StateEffect.define();
  const syncField = StateField.define({
    create: () => Decoration.none,
    update(deco, tr) {
      let next = deco;
      try {
        next = next.map(tr.changes);
      } catch {
        next = Decoration.none;
      }
      for (const e of tr.effects) {
        if (e.is(setSyncEffect)) {
          next = e.value ? e.value : Decoration.none;
        }
      }
      return next;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const tagPair = createTagPairSupport({
    syntaxTree,
    EditorState,
    Decoration,
    ViewPlugin,
    EditorView,
    keymap,
  });

  const view = new EditorView({
    doc: String(doc ?? ''),
    parent: host,
    extensions: [
      // 快捷键优先于 basicSetup（先入者优先级高）
      keymap.of([
        { key: 'Mod-s', run: () => { onApply?.(); return true; } },
        { key: 'Mod-Enter', run: () => { onApply?.(); return true; } },
      ]),
      basicSetup,
      // 搜索面板停靠顶部（不与底部内容争位，长文档更顺手）
      search({ top: true }),
      html({ autoCloseTags: true }),
      EditorView.lineWrapping,
      syncField,
      ...tagPair.extensions,
      placeholderText ? placeholder(placeholderText) : [],
      buildTheme(EditorView),
      syntaxHighlighting(buildHighlight(tags, HighlightStyle), { fallback: true }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString());
        }
      }),
    ],
  });

  // ---------------------------------------------------------------------------
  // AI 辅助接口（预留层，见文件头约定）
  // ---------------------------------------------------------------------------
  const api = {
    /** 当前源码全文 */
    getCode() {
      return view.state.doc.toString();
    },

    /** 整体替换源码（单事务，可撤销） */
    setCode(text) {
      const body = String(text ?? '');
      const { state } = view;
      view.dispatch(
        state.update({
          changes: { from: 0, to: state.doc.length, insert: body },
        }),
      );
      return body.length;
    },

    /**
     * 插入代码片段。
     * @param {string} text 片段（建议为格式化后的 HTML）
     * @param {{ at?: 'cursor'|'start'|'end', select?: boolean }} [opts]
     *   select 默认 true：插入后选中新片段，用户立即看见并可直接修改
     * @returns {{ from: number, to: number } | null}
     */
    insertCode(text, { at = 'cursor', select = true } = {}) {
      const body = String(text ?? '');
      if (!body) return null;
      const { state } = view;
      let pos;
      if (at === 'end') pos = state.doc.length;
      else if (at === 'start') pos = 0;
      else pos = state.selection.main.head;
      let insertText = body;
      // 末尾追加时补换行，避免片段粘在最后一行
      if (at === 'end' && pos > 0) {
        const lastChar = state.doc.sliceString(pos - 1, pos);
        if (lastChar !== '\n' && !insertText.startsWith('\n')) {
          insertText = `\n${insertText}`;
        }
      }
      view.dispatch(
        state.update({
          changes: { from: pos, insert: insertText },
          selection: select
            ? { anchor: pos, head: pos + insertText.length }
            : { anchor: pos + insertText.length },
          scrollIntoView: true,
        }),
      );
      view.focus();
      return { from: pos, to: pos + insertText.length };
    },

    /** 文档末尾追加（流式输出按 chunk 循环调用即可） */
    appendCode(text) {
      return api.insertCode(text, { at: 'end', select: false });
    },

    /** 当前选区：{ text, from, to, empty } */
    getSelection() {
      const { state } = view;
      const { from, to, empty } = state.selection.main;
      return { text: state.doc.sliceString(from, to), from, to, empty };
    },

    /** 替换当前选区（结果保持选中，用户可继续微调） */
    replaceSelection(text) {
      const body = String(text ?? '');
      const { state } = view;
      const { from, to } = state.selection.main;
      view.dispatch(
        state.update({
          changes: { from, to, insert: body },
          selection: { anchor: from, head: from + body.length },
          scrollIntoView: true,
        }),
      );
      view.focus();
      return { from, to: from + body.length };
    },

    /** 清空文档 */
    clear() {
      api.setCode('');
    },

    focus() {
      view.focus();
    },

    /** 文档规模（供 AI 面板展示上下文大小） */
    getStats() {
      return { length: view.state.doc.length, lines: view.state.doc.lines };
    },

    /**
     * 双栏同步定位：高亮 [from, to] 区间、选中该区间并滚动到可视区。
     * 选中是滚动的载体（scrollIntoView 跟选区走）；只 dispatch 不 focus，
     * 焦点仍在左侧编辑器，不干扰左侧输入。
     * @returns {{ from: number, to: number } | null}
     */
    locateRange(from, to) {
      try {
        const len = view.state.doc.length;
        const a = Math.max(0, Math.min(Number(from) || 0, len));
        const b = Math.max(0, Math.min(Number(to) || 0, len));
        if (!(b > a)) {
          view.dispatch({ effects: setSyncEffect.of(null) });
          return null;
        }
        const mark = Decoration.mark({ class: 'cm-sync-match' });
        view.dispatch({
          effects: setSyncEffect.of(Decoration.set([mark.range(a, b)], true)),
          selection: { anchor: a, head: b },
          scrollIntoView: true,
        });
        return { from: a, to: b };
      } catch {
        return null;
      }
    },

    /**
     * 双栏同步定位（按元素展开）：从命中点 pos 沿语法树上浮到目标元素，
     * 高亮整个元素（开标签到闭标签，含子节点），并选中+滚动到可视区。
     * @param {number} pos 片段命中点（findNearestSnippet 的 from）
     * @param {string|null} tagName 期望标签（'p'/'table'/'img' 等小写）；
     *   null 则取包含命中点的最内层元素（如分栏 div.cx 列容器）
     * @returns {{ from: number, to: number } | null}
     */
    locateElementAt(pos, tagName) {
      try {
        const len = view.state.doc.length;
        const p = Math.max(0, Math.min(Number(pos) || 0, len));
        const tree = syntaxTree(view.state);
        let node = null;
        try {
          node = tree.resolveInner(p, -1);
        } catch {
          node = null;
        }
        if (!node) {
          try {
            node = tree.resolveInner(p, 1);
          } catch {
            node = null;
          }
        }
        if (!node) return null;
        // 上浮到 Element（命中标签名/属性/文本均可，统一归属到元素）
        const toElement = (n) => {
          let el = n;
          while (el && el.name !== 'Element') el = el.parent;
          return el || null;
        };
        const tagOf = (elem) => {
          try {
            for (let ch = elem.firstChild; ch; ch = ch.nextSibling) {
              if (ch.name === 'OpenTag' || ch.name === 'SelfClosingTag') {
                for (let g = ch.firstChild; g; g = g.nextSibling) {
                  if (g.name === 'TagName') {
                    return view.state.doc.sliceString(g.from, g.to).toLowerCase();
                  }
                }
              }
            }
          } catch {
            /* 忽略 */
          }
          return '';
        };
        let el = toElement(node);
        const want = String(tagName || '').toLowerCase();
        if (el && want) {
          let depth = 0;
          while (el && tagOf(el) !== want && depth < 8) {
            const up = toElement(el.parent);
            if (!up || up === el) break;
            el = up;
            depth += 1;
          }
          // 吻合失败则回落最内层，避免误高亮整篇
          if (!el || tagOf(el) !== want) el = toElement(node);
        }
        if (!el) return null;
        return api.locateRange(el.from, el.to);
      } catch {
        return null;
      }
    },

    /** 清除同步定位高亮 */
    clearLocate() {
      try {
        view.dispatch({ effects: setSyncEffect.of(null) });
      } catch {
        /* 忽略 */
      }
    },

    destroy() {
      view.destroy();
    },
  };

  return { view, api };
}
