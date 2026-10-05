/**
 * 表单配置组件的挂载 / 取消冒烟测试。
 *
 * 历史背景：本文件原名 `repro.test.js`，是排查「抽屉关不掉 / onClose 抛错」时留下的
 * 调试脚手架，有四个问题：
 *   1. 用硬编码的 pnpm store 绝对路径导入 `@vue/test-utils`（换机器/重装即失效，
 *      且让 Vite 去优化项目外的依赖，实测把整个 vitest 运行挂死 9 分钟无输出）；
 *   2. 断言的是**已不存在的旧 API**：抽屉壳已经移到 `list.vue` 的 Vben Drawer，
 *      `FormSchemaDrawer` 现在只是内容组件（props 是 `form`，不是 `open`/`formId`），
 *      组件里根本没有 `.ant-drawer-close`；
 *   3. 只 `console.log`，没有任何断言，还有一条 `it('always passes')` 占位；
 *   4. 无法反映回归。
 *
 * 现改为对当前 props/emits 的真实断言。antdv-next 按仓库既有做法 stub 掉
 * （见 `components/app-crud-table/__tests__/component-events.test.js`），
 * 避免加载真实组件库带来的耗时与不确定性。
 *
 * ⚠️ 运行前提（两条都必须满足，否则本文件收集不到用例）：
 *   - `@vue/test-utils` 必须能从 `apps/web-pc` 解析到。它只被
 *     `packages/effects/common-ui` 声明，pnpm 严格布局不会链到 `apps/web-pc`；
 *     已在 `apps/web-pc/package.json` 声明，本机 `pnpm install` 不可用时按 SKILL.md 手工补软链。
 *   - 必须在**前端仓库根目录**跑，才能加载根 `vitest.config.ts` 的 `environment: 'happy-dom'`。
 *     在 `apps/web-pc` 下跑会用默认的 node 环境，组件测试会因 `sessionStorage is not defined` 挂掉。
 *
 * 这里只挂载两个 Modal：它们只依赖 `antdv-next` + `formSchema.js`。
 * `FormSchemaDrawer` 未纳入——它 import `#/api/resource`，会把 `#/api/request` → stores 整条链
 * 拉进测试环境（`sessionStorage`、缺失的 `centrifuge`），在本机跑不起来。
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import FormFieldModal from '../FormFieldModal.vue';
import FormRuleModal from '../FormRuleModal.vue';

vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  const stub = (name, emits = []) =>
    defineComponent({
      emits,
      name,
      setup(_props, { slots }) {
        return () => h('div', slots.default?.());
      },
    });
  const Input = stub('Input');
  Input.TextArea = stub('InputTextArea');
  const Form = stub('Form');
  Form.Item = stub('FormItem');
  return {
    Button: stub('Button', ['click']),
    Form,
    FormItem: stub('FormItem'),
    Input,
    InputNumber: stub('InputNumber'),
    Popconfirm: stub('Popconfirm'),
    Select: stub('Select'),
    Switch: stub('Switch'),
    Tag: stub('Tag'),
    message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

/** stub 后的 Button 渲染成 div，按可见文案定位并手动 emit click。 */
function clickButton(wrapper, text) {
  const button = wrapper
    .findAllComponents({ name: 'Button' })
    .find((item) => item.text().trim() === text);
  expect(button, `未找到按钮「${text}」`).toBeTruthy();
  button.vm.$emit('click');
}

describe('表单配置组件冒烟', () => {
  it('formFieldModal：点「取消」emit cancel', () => {
    const wrapper = mount(FormFieldModal, {
      props: { field: null, disabled: false },
    });
    clickButton(wrapper, '取消');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });

  it('formRuleModal：点「取消」emit cancel', () => {
    const wrapper = mount(FormRuleModal, {
      props: { field: { name: 'age', type: 'number' }, disabled: false },
    });
    clickButton(wrapper, '取消');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });
});
