import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  drawerApi: { close: vi.fn(), open: vi.fn() },
  message: { error: vi.fn(), success: vi.fn() },
  modalApi: { close: vi.fn(), open: vi.fn() },
  resource: {
    destroy: vi.fn(),
    get: vi.fn(),
    store: vi.fn(),
    update: vi.fn(),
    uris: [],
  },
  router: {
    back: vi.fn(),
    options: { history: { state: {} } },
    push: vi.fn(),
    replace: vi.fn(),
  },
  tabs: { closeCurrentTab: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRouter: () => mocks.router }));
vi.mock('@vben/common-ui', () => ({
  useVbenDrawer: () => [{ name: 'Drawer' }, mocks.drawerApi],
  useVbenModal: () => [{ name: 'Modal' }, mocks.modalApi],
}));
vi.mock('@vben/hooks', () => ({ useTabs: () => mocks.tabs }));
vi.mock('antdv-next', () => ({ message: mocks.message }));
vi.mock('#/api/resource', () => ({
  default: class Resource {
    constructor(uri) {
      this.uri = uri;
      mocks.resource.uris.push(uri);
    }

    destroy(id) {
      return mocks.resource.destroy(this.uri, id);
    }

    get(id) {
      return mocks.resource.get(this.uri, id);
    }

    store(payload) {
      return mocks.resource.store(this.uri, payload);
    }

    update(id, payload) {
      return mocks.resource.update(this.uri, id, payload);
    }
  },
}));

import { useCrudTableDetail } from '../composables/useCrudTableDetail.js';

function createDetail(model = {}, overrides = {}) {
  const emit = vi.fn();
  const reload = vi.fn();
  const uploadPendingFiles = vi.fn();
  const validate = vi.fn();
  const modelValue = ref(model);
  const props = {
    apiPrefix: 'projects/7',
    apiUrl: 'tasks',
    detailFormat: (data) => data,
    fields: [{ default: 'draft', field: 'state' }],
    idKey: 'uuid',
    openMode: { create: 'modal', detail: 'modal' },
    saveFormat: (payload) => payload,
    ...overrides,
  };
  const formApi = {
    expandDotKeys: vi.fn((payload) => payload),
    flattenDotFieldValues: vi.fn((payload) => payload),
    formRef: ref({ validate }),
    uploadPendingFiles,
  };
  const routeApi = {
    isNested: false,
    listRoutePath: ref('/tasks'),
    navigateToDetail: vi.fn(),
    navigateToList: vi.fn(),
  };
  const api = useCrudTableDetail(
    props,
    { emit },
    { formApi, modelValue, reload, routeApi },
  );
  return {
    api,
    emit,
    formApi,
    modelValue,
    props,
    reload,
    routeApi,
    uploadPendingFiles,
    validate,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resource.uris.length = 0;
  mocks.router.options.history.state = {};
});

describe('useCrudTableDetail requests', () => {
  it('creates through the prefixed collection endpoint', async () => {
    const detail = createDetail({ name: 'Inspection' });
    mocks.resource.store.mockResolvedValue({ uuid: 'task-1' });

    await detail.api.submit();

    expect(detail.validate).toHaveBeenCalledOnce();
    expect(detail.uploadPendingFiles).toHaveBeenCalledOnce();
    expect(mocks.resource.store).toHaveBeenCalledWith('projects/7/tasks', {
      name: 'Inspection',
    });
    expect(detail.emit).toHaveBeenCalledWith('saved', { uuid: 'task-1' });
    expect(detail.reload).toHaveBeenCalledOnce();
    expect(mocks.modalApi.close).toHaveBeenCalledOnce();
    expect(detail.api.saving.value).toBe(false);
  });

  it('updates through the unprefixed item endpoint', async () => {
    const detail = createDetail({ name: 'Updated', uuid: 'task-1' });
    mocks.resource.update.mockResolvedValue({
      name: 'Updated',
      uuid: 'task-1',
    });

    await detail.api.submit();

    expect(mocks.resource.update).toHaveBeenCalledWith(
      'tasks',
      'task-1',
      { name: 'Updated', uuid: 'task-1' },
    );
  });

  it('does not save when validation or save formatting rejects', async () => {
    const invalid = createDetail({ name: '' });
    invalid.validate.mockRejectedValue(new Error('required'));

    await invalid.api.submit();
    expect(mocks.message.error).toHaveBeenCalledWith('表单有误');
    expect(mocks.resource.store).not.toHaveBeenCalled();

    const cancelled = createDetail(
      { name: 'Cancelled' },
      { saveFormat: () => false },
    );
    await cancelled.api.submit();
    expect(mocks.resource.store).not.toHaveBeenCalled();
    expect(cancelled.api.saving.value).toBe(false);
  });

  it('loads, formats, and publishes item detail', async () => {
    const detail = createDetail({}, {
      detailFormat: (data) => ({ ...data, formatted: true }),
    });
    mocks.resource.get.mockResolvedValue({ data: { uuid: 'task-2' } });

    await expect(detail.api.loadDetail('task-2')).resolves.toBe(true);

    expect(mocks.resource.get).toHaveBeenCalledWith('tasks', 'task-2');
    expect(detail.modelValue.value).toEqual({
      formatted: true,
      uuid: 'task-2',
    });
    expect(detail.emit).toHaveBeenCalledWith('update:modelValue', {
      formatted: true,
      uuid: 'task-2',
    });
  });

  it('deletes and reverse-audits through item endpoints', async () => {
    const detail = createDetail();

    await detail.api.deleteItem({ uuid: 'task-3' });
    await detail.api.audit({ uuid: 'task-3' }, false);

    expect(mocks.resource.destroy).toHaveBeenCalledWith('tasks', 'task-3');
    expect(mocks.resource.store).toHaveBeenCalledWith('tasks/task-3/audit', {
      reason: '',
      status: false,
    });
    expect(detail.reload).toHaveBeenCalledTimes(2);
  });

  it('requires a reason for rejection and submits valid audits', async () => {
    const detail = createDetail();
    detail.api.openAuditDialog({ uuid: 'task-4' });

    await detail.api.submitAudit({ reason: '', status: 0 });
    expect(mocks.message.error).toHaveBeenCalledWith('请输入原因');
    expect(mocks.resource.store).not.toHaveBeenCalled();

    await detail.api.submitAudit({ reason: 'Missing evidence', status: 0 });

    expect(mocks.resource.store).toHaveBeenCalledWith('tasks/task-4/audit', {
      reason: 'Missing evidence',
      status: 0,
    });
    expect(detail.api.auditDialog.value).toBe(false);
    expect(detail.api.auditRow.value).toBeNull();
    expect(detail.api.auditSubmitting.value).toBe(false);
    expect(detail.reload).toHaveBeenCalledOnce();
  });
});
