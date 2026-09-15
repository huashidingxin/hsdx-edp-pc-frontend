import { describe, it, expect } from 'vitest';
import { mount } from '/Users/hsdx-mac/Dev/Projects/hsdx-projects/edp/apps/hsdx-edp-pc-frontend/node_modules/.pnpm/@vue+test-utils@2.4.11_@vue+compiler-dom@3.5.41_@vue+server-renderer@3.5.41_vue@3.5.41_typescript@6.0.3_/node_modules/@vue/test-utils';
import FormSchemaDrawer from '../FormSchemaDrawer.vue';
import FormFieldModal from '../FormFieldModal.vue';
import FormRuleModal from '../FormRuleModal.vue';

function tryClose(wrapper, name) {
  try {
    const close = wrapper.find('.ant-drawer-close, .ant-modal-close');
    if (close.exists()) {
      close.trigger('click');
      console.log(`[${name}] clicked close, no error`);
    } else {
      console.log(`[${name}] no close button; html:`, wrapper.html().slice(0, 400));
    }
  } catch (e) {
    console.log(`[${name}] ERROR on close:`, e && e.stack ? e.stack : e);
  }
}

describe('repro onClose', () => {
  it('FormSchemaDrawer open + close', () => {
    let w;
    try {
      w = mount(FormSchemaDrawer, { props: { open: true, formId: 1 } });
    } catch (e) {
      console.log('[drawer] MOUNT ERROR:', e && e.stack ? e.stack : e);
    }
    if (w) tryClose(w, 'drawer');
  });

  it('FormFieldModal open + close', () => {
    let w;
    try {
      w = mount(FormFieldModal, { props: { open: true, field: null, disabled: false } });
    } catch (e) {
      console.log('[fieldModal] MOUNT ERROR:', e && e.stack ? e.stack : e);
    }
    if (w) tryClose(w, 'fieldModal');
  });

  it('FormRuleModal open + close', () => {
    let w;
    try {
      w = mount(FormRuleModal, { props: { open: true, rules: [] } });
    } catch (e) {
      console.log('[ruleModal] MOUNT ERROR:', e && e.stack ? e.stack : e);
    }
    if (w) tryClose(w, 'ruleModal');
  });

  it('always passes', () => {
    expect(true).toBe(true);
  });
});
