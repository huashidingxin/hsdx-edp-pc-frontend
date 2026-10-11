/**
 * 原生建议弹窗渲染器（slash `/` 与 mention `@` 共用）
 *
 * 不依赖框架组件：纯 DOM + 内联样式，随用随建、用完即焚。
 * 键盘完全自理（ArrowUp/Down/Enter/Escape），onKeyDown 返回 true
 * 即覆盖 suggestion 核心默认行为，避免双重处理。
 *
 * @param {object} options
 * @param {(item: object) => { title: string, hint?: string }} options.formatItem
 * @param {string | ((query: string) => string)} options.emptyText 无结果文案
 */
const POPUP_STYLE = [
  'position: fixed',
  'z-index: 10001',
  'min-width: 220px',
  'max-width: 320px',
  'max-height: 280px',
  'overflow-y: auto',
  'background: #ffffff',
  'border: 1px solid #e5e7eb',
  'border-radius: 8px',
  'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14)',
  'padding: 4px',
  'font-size: 12px',
  'user-select: none',
].join('; ');

const ITEM_STYLE = [
  'display: flex',
  'align-items: center',
  'gap: 8px',
  'width: 100%',
  'box-sizing: border-box',
  'padding: 6px 10px',
  'border: none',
  'border-radius: 6px',
  'background: transparent',
  'cursor: pointer',
  'text-align: left',
  'font-size: 12px',
  'color: #111827',
].join('; ');

const ITEM_ACTIVE_STYLE = 'background: #eef2ff;';

export function createPopupRenderer({ formatItem, emptyText = '无匹配' }) {
  let el = null;
  let items = [];
  let selectedIndex = 0;
  let command = null;

  function unmount() {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    items = [];
    command = null;
  }

  function position(clientRect) {
    if (!el || !clientRect) return;
    try {
      const rect = typeof clientRect === 'function' ? clientRect() : clientRect;
      if (!rect) return;
      const viewportH = window.innerHeight || 800;
      const estH = Math.min(280, Math.max(48, items.length * 34 + 16));
      // 底部空间不足则向上翻转
      const below = rect.bottom + 8 + estH <= viewportH;
      el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
      if (below) {
        el.style.top = `${rect.bottom + 6}px`;
        el.style.bottom = '';
      } else {
        el.style.top = '';
        el.style.bottom = `${Math.max(8, viewportH - rect.top + 6)}px`;
      }
    } catch {
      /* 忽略定位失败，保持默认位置 */
    }
  }

  function paint() {
    if (!el) return;
    el.innerHTML = '';
    if (!items || items.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = typeof emptyText === 'function' ? emptyText('') : emptyText;
      empty.setAttribute(
        'style',
        'padding: 8px 10px; color: #9ca3af; font-size: 12px;',
      );
      el.appendChild(empty);
      return;
    }
    items.forEach((item, i) => {
      const { title, hint } = formatItem(item) || {};
      const row = document.createElement('button');
      row.setAttribute('type', 'button');
      row.setAttribute('style', ITEM_STYLE + (i === selectedIndex ? ITEM_ACTIVE_STYLE : ''));
      const titleEl = document.createElement('span');
      titleEl.textContent = title || String(i);
      titleEl.setAttribute('style', 'font-weight: 500;');
      row.appendChild(titleEl);
      if (hint) {
        const hintEl = document.createElement('span');
        hintEl.textContent = hint;
        hintEl.setAttribute('style', 'margin-left: auto; color: #9ca3af; font-size: 11px;');
        row.appendChild(hintEl);
      }
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', () => {
        if (command) command(item);
      });
      row.addEventListener('mousemove', () => {
        if (selectedIndex !== i) {
          selectedIndex = i;
          paint();
        }
      });
      el.appendChild(row);
    });
  }

  return {
    onStart(props) {
      items = props.items || [];
      command = props.command;
      selectedIndex = 0;
      unmount();
      el = document.createElement('div');
      el.setAttribute('style', POPUP_STYLE);
      el.className = 'app-editor-suggestion-popup';
      document.body.appendChild(el);
      position(props.clientRect);
      paint();
    },
    onUpdate(props) {
      items = props.items || [];
      command = props.command;
      selectedIndex = 0;
      position(props.clientRect);
      paint();
    },
    onKeyDown(props) {
      if (!el) return false;
      if (props.event.key === 'ArrowDown') {
        props.event.preventDefault();
        selectedIndex = items.length === 0 ? 0 : (selectedIndex + 1) % items.length;
        paint();
        return true;
      }
      if (props.event.key === 'ArrowUp') {
        props.event.preventDefault();
        selectedIndex =
          items.length === 0 ? 0 : (selectedIndex - 1 + items.length) % items.length;
        paint();
        return true;
      }
      if (props.event.key === 'Enter') {
        if (items.length === 0) return false;
        props.event.preventDefault();
        if (command) command(items[selectedIndex] || items[0]);
        return true;
      }
      // Escape 等交还核心处理（关闭弹窗）
      return false;
    },
    onExit() {
      unmount();
    },
  };
}
