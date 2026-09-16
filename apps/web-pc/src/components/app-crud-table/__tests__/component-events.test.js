import { shallowMount } from '@vue/test-utils';
import { Modal } from 'antdv-next';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const testRef = (value) => ({ __v_isRef: true, value });
  const dataApi = {
    columnSlots: testRef({}),
    gridOptions: { pagerConfig: { currentPage: 1, pageSize: 15 } },
    handlePageData: vi.fn(),
    list: testRef([{ id: 1, name: 'Task' }]),
    refresh: vi.fn(),
    reload: vi.fn(),
    search: vi.fn(),
    setFiltersRef: vi.fn(),
    setRouteRef: vi.fn(),
  };
  const filters = testRef({ state: 'active' });
  const detailApi = {
    DrawerComponent: { name: 'DrawerComponent' },
    ModalComponent: { name: 'ModalComponent' },
    audit: vi.fn(),
    auditDialog: testRef(false),
    auditRow: testRef(null),
    auditSubmitting: testRef(false),
    buildDefaultItem: vi.fn(() => ({})),
    closeDetail: vi.fn(),
    deleteItem: vi.fn(),
    detailError: testRef(null),
    editing: testRef(false),
    loadDetail: vi.fn(),
    loading: testRef(false),
    openAuditDialog: vi.fn(),
    openDetail: vi.fn(),
    openType: testRef('modal'),
    refreshing: testRef(false),
    saving: testRef(false),
    submit: vi.fn(),
    submitAudit: vi.fn(),
  };
  return { dataApi, detailApi, filters, testRef };
});

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
  const Menu = stub('Menu');
  Menu.Item = stub('MenuItem');

  return {
    Button: stub('Button', ['click']),
    Dropdown: stub('Dropdown'),
    Form: stub('Form'),
    FormItem: stub('FormItem'),
    Input,
    Menu,
    Modal: stub('Modal', ['cancel', 'ok']),
    Radio: stub('Radio'),
    RadioGroup: stub('RadioGroup'),
    Space: stub('Space'),
  };
});
vi.mock('vue-router', () => {
  const chain = () => ({ beforeEach: vi.fn(), afterEach: vi.fn(), push: vi.fn(), replace: vi.fn() });
  return {
    useRoute: () => ({ meta: {}, query: {} }),
    useRouter: () => chain(),
    createRouter: () => chain(),
    createWebHistory: () => ({}),
    createWebHashHistory: () => ({}),
  };
});
vi.mock('../composables/useCrudTablePermission.js', () => ({
  useCrudTablePermission: () => ({ checkPermission: () => true }),
}));
vi.mock('../composables/useCrudTableRoute.js', () => ({
  useCrudTableRoute: () => ({
    detailRouteAction: mocks.testRef(null),
    detailRouteId: mocks.testRef(null),
    isNested: false,
    pageModel: mocks.testRef('list'),
  }),
}));
vi.mock('../composables/useCrudTableForm.js', () => ({
  useCrudTableForm: () => ({
    formatedFields: mocks.testRef([]),
    reset: vi.fn(),
    setFieldRef: vi.fn(),
    validateMessages: {},
  }),
}));
vi.mock('../composables/useCrudTableData.js', () => ({
  useCrudTableData: () => mocks.dataApi,
}));
vi.mock('../composables/useCrudTableFilters.js', () => ({
  useCrudTableFilters: () => ({
    apply: vi.fn(),
    canToggleExpand: mocks.testRef(false),
    filterExpand: mocks.testRef(false),
    filters: mocks.filters,
    reset: vi.fn(),
    setFilterState: vi.fn(),
    toggleExpand: vi.fn(),
    visibleFilterFields: mocks.testRef([]),
  }),
}));
vi.mock('../composables/useCrudTableActions.js', () => ({
  useCrudTableActions: () => ({
    registerAction: vi.fn(),
    resolveRowActions: vi.fn(() => ({ inline: [], more: [] })),
    unregisterAction: vi.fn(),
  }),
}));
vi.mock('../composables/useCrudTableDetail.js', () => ({
  resolveOpenMode: vi.fn((mode) => mode),
  useCrudTableDetail: () => mocks.detailApi,
}));

import AppCrudTable from '../AppCrudTable.vue';
import CrudAuditModal from '../parts/CrudAuditModal.vue';
import CrudToolbar from '../parts/CrudToolbar.vue';

describe('AppCrudTable component events', () => {
  it('forwards export with the current list and filters', async () => {
    const wrapper = shallowMount(AppCrudTable, {
      props: { apiUrl: 'tasks' },
    });

    wrapper.findComponent(CrudToolbar).vm.$emit('export');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('export')).toEqual([
      [{ filters: { state: 'active' }, list: [{ id: 1, name: 'Task' }] }],
    ]);
  });

  it('emits audit form data without performing resource requests', async () => {
    const wrapper = shallowMount(CrudAuditModal, {
      props: { open: true },
    });

    wrapper.findComponent(Modal).vm.$emit('ok');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('submit')).toEqual([
      [{ reason: '', status: 1 }],
    ]);
  });
});
