import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';

import type { ComponentPropsMap, ComponentType } from './component';

import { defineComponent, h, watch } from 'vue';

import { usePreferences } from '@vben/preferences';

import {
  setupVbenVxeTable,
  useVbenVxeGrid as useGrid,
} from '@vben/plugins/vxe-table';

import { Button, Image } from 'antdv-next';

import {
  VxeButton,
  VxeCheckbox,
  VxeIcon,
  VxeInput,
  VxeLoading,
  VxeModal,
  VxeNumberInput,
  VxePager,
  VxeRadioGroup,
  VxeSelect,
  VxeTooltip,
  VxeUpload,
} from 'vxe-pc-ui';
import enUS from 'vxe-pc-ui/lib/language/en-US';
import zhCN from 'vxe-pc-ui/lib/language/zh-CN';
import {
  VxeColgroup,
  VxeColumn,
  VxeGrid,
  VxeTable,
  VxeToolbar,
  VXETable,
} from 'vxe-table';

import { useVbenForm } from './form';

// 语言包
function normalizeLocale<T extends Record<string, any>>(mod: T) {
  return mod && typeof mod === 'object' && 'default' in mod
    ? mod.default
    : mod;
}
const locales = {
  'zh-CN': normalizeLocale(zhCN),
  'en-US': normalizeLocale(enUS),
};
type SupportedLocale = keyof typeof locales;

function resolveLocale(locale: string | undefined): SupportedLocale {
  return locale && locale in locales ? (locale as SupportedLocale) : 'zh-CN';
}

// 虚拟组件，避免 vxe-table 因缺少组件报错
const createVirtualComponent = (name = '') =>
  defineComponent({ name });

/**
 * 将组件注册到 vxe-table 自身的 VXETable 实例
 *
 * 背景：新 Vite 预构建时，vxe-table 和 vxe-pc-ui 各自内联了独立的
 * @vxe-ui/core 实例（i18nConfigStore）。setupVbenVxeTable() 只管
 * vxe-pc-ui 的 VxeUI，但 app-crud-table 直接使用 vxe-table 的
 * VxeGrid 组件，需要另一个实例也有组件注册和 i18n。
 */
function setupVxeTableInstance() {
  // 组件注册
  VXETable.component(VxeTable);
  VXETable.component(VxeColumn);
  VXETable.component(VxeColgroup);
  VXETable.component(VxeGrid);
  VXETable.component(VxeToolbar);
  VXETable.component(VxeButton);
  VXETable.component(VxeCheckbox);
  VXETable.component(createVirtualComponent('VxeForm'));
  VXETable.component(VxeIcon);
  VXETable.component(VxeInput);
  VXETable.component(VxeLoading);
  VXETable.component(VxeModal);
  VXETable.component(VxeNumberInput);
  VXETable.component(VxePager);
  VXETable.component(VxeRadioGroup);
  VXETable.component(VxeSelect);
  VXETable.component(VxeTooltip);
  VXETable.component(VxeUpload);

  // i18n / theme 跟随 preference 变化
  const { isDark, locale } = usePreferences();
  watch(
    [() => isDark.value, () => locale.value],
    ([dark, loc]) => {
      const lang = resolveLocale(loc);
      VXETable.setTheme(dark ? 'dark' : 'light');
      VXETable.setI18n(lang, locales[lang]);
      VXETable.setLanguage(lang);
    },
    { immediate: true },
  );

  // 全局配置 + 自定义渲染器
  VXETable.setConfig({
    grid: {
      align: 'center',
      border: false,
      columnConfig: { resizable: true },
      minHeight: 180,
      formConfig: { enabled: false },
      proxyConfig: {
        autoLoad: true,
        response: { result: 'items', total: 'total', list: 'items' },
        showActiveMsg: true,
        showResponseMsg: false,
      },
      round: true,
      showOverflow: true,
    } as VxeTableGridOptions,
  });

  VXETable.renderer.add('CellImage', {
    renderTableDefault(renderOpts, params) {
      const { column, row } = params;
      return h(Image, { src: row[column.field], ...renderOpts.props });
    },
  });
  VXETable.renderer.add('CellLink', {
    renderTableDefault(renderOpts) {
      return h(Button, { size: 'small', type: 'link' }, {
        default: () => renderOpts.props?.text,
      });
    },
  });

}

// 立即注册到 vxe-table 自己的 VXETable 实例
setupVxeTableInstance();

// 大仓原有的 setupVbenVxeTable（管 vxe-pc-ui 的 VxeUI）
setupVbenVxeTable({
  configVxeTable: (vxeUI) => {
    vxeUI.setConfig({
      grid: {
        align: 'center',
        border: false,
        columnConfig: {
          resizable: true,
        },
        minHeight: 180,
        formConfig: {
          // 全局禁用vxe-table的表单配置，使用formOptions
          enabled: false,
        },
        proxyConfig: {
          autoLoad: true,
          response: {
            result: 'items',
            total: 'total',
            list: 'items',
          },
          showActiveMsg: true,
          showResponseMsg: false,
        },
        round: true,
        showOverflow: true,
        size: 'small',
      } as VxeTableGridOptions,
    });

    // 表格配置项可以用 cellRender: { name: 'CellImage' },
    vxeUI.renderer.add('CellImage', {
      renderTableDefault(renderOpts, params) {
        const { props } = renderOpts;
        const { column, row } = params;
        return h(Image, { src: row[column.field], ...props });
      },
    });

    // 表格配置项可以用 cellRender: { name: 'CellLink' },
    vxeUI.renderer.add('CellLink', {
      renderTableDefault(renderOpts) {
        const { props } = renderOpts;
        return h(
          Button,
          { size: 'small', type: 'link' },
          { default: () => props?.text },
        );
      },
    });

    // 这里可以自行扩展 vxe-table 的全局配置，比如自定义格式化
    // vxeUI.formats.add
  },
  useVbenForm,
});

export const useVbenVxeGrid = <T extends Record<string, any>>(
  ...rest: Parameters<typeof useGrid<T, ComponentType, ComponentPropsMap>>
) => useGrid<T, ComponentType, ComponentPropsMap>(...rest);

export type * from '@vben/plugins/vxe-table';
