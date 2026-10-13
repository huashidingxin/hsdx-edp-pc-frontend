import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { useCrudTableForm } from '../composables/useCrudTableForm.js';

function createForm(model = {}, overrides = {}) {
  const props = {
    excludeFields: [],
    fieldFormat: (field) => field,
    fields: [],
    idKey: 'uuid',
    ...overrides,
  };
  return useCrudTableForm(props, { emit: vi.fn() }, ref(model));
}

describe('useCrudTableForm', () => {
  it('uses the configured identity key when formatting edit fields', () => {
    const fieldFormat = vi.fn((field) => field);
    const form = createForm(
      { uuid: 'staff-1' },
      { fieldFormat, fields: [{ field: 'name' }] },
    );

    expect(form.formatedFields.value).toHaveLength(1);
    expect(fieldFormat).toHaveBeenCalledWith(
      { field: 'name' },
      { uuid: 'staff-1' },
    );
  });

  it('filters excluded and dynamically disabled fields', () => {
    const form = createForm(
      {},
      {
        excludeFields: ['hidden'],
        fieldFormat: (field) => (field.field === 'disabled' ? false : field),
        fields: [
          { field: 'name' },
          { field: 'hidden' },
          { field: 'disabled' },
        ],
      },
    );

    expect(form.formatedFields.value.map((field) => field.field)).toEqual([
      'name',
    ]);
  });

  it('removes display-only meta fields from the form body', () => {
    // ID 在标题区展示、created_at/updated_at 在底部操作容器展示，
    // 声明为 displayOnly 的这些字段不再在表单体重复渲染
    const form = createForm(
      {
        uuid: 'staff-1',
        created_at: '2026-09-23 23:51:01',
        updated_at: '2026-10-13 10:00:00',
      },
      {
        fields: [
          { field: 'uuid', type: 'text', label: 'ID', displayOnly: true },
          { field: 'name' },
          {
            field: 'created_at',
            type: 'datetime',
            label: '创建时间',
            displayOnly: true,
          },
          {
            field: 'updated_at',
            type: 'datetime',
            label: '更新时间',
            displayOnly: true,
          },
        ],
      },
    );

    expect(form.formatedFields.value.map((field) => field.field)).toEqual([
      'name',
    ]);
  });

  it('hides the display-only meta fields for new records too', () => {
    const form = createForm(
      {},
      {
        idKey: 'id',
        fields: [
          { field: 'id', type: 'text', label: 'ID', displayOnly: true },
          {
            field: 'created_at',
            type: 'datetime',
            label: '创建时间',
            displayOnly: true,
          },
          { field: 'name' },
        ],
      },
    );

    expect(form.formatedFields.value.map((field) => field.field)).toEqual([
      'name',
    ]);
  });

  it('keeps editable same-name fields in the form body', () => {
    const form = createForm(
      { uuid: 'staff-1', created_at: '2026-09-23 23:51:01' },
      {
        fields: [
          { field: 'uuid' },
          {
            field: 'created_at',
            type: 'datetime',
            label: '创建时间',
          },
          { field: 'name' },
        ],
      },
    );

    expect(form.formatedFields.value.map((field) => field.field)).toEqual([
      'uuid',
      'created_at',
      'name',
    ]);
  });

  it('uploads only pending file fields with a mounted uploader', async () => {
    const upload = vi.fn();
    const form = createForm(
      {
        attachment: [{ url: 'blob:pending' }],
        published: [{ url: 'https://files.example.test/file.pdf' }],
      },
      {
        fields: [
          { field: 'attachment', type: 'file' },
          { field: 'published', type: 'file' },
        ],
      },
    );
    const [attachment, published] = form.formatedFields.value;
    form.setFieldRef(attachment.renderKey, { fieldRef: { upload } });
    form.setFieldRef(published.renderKey, { fieldRef: { upload } });

    await form.uploadPendingFiles();

    expect(upload).toHaveBeenCalledOnce();
  });

  it('ignores partially mounted file-field refs', async () => {
    const form = createForm(
      { attachment: [{ url: 'blob:pending' }] },
      { fields: [{ field: 'attachment', type: 'file' }] },
    );
    form.setFieldRef(form.formatedFields.value[0].renderKey, {});

    await expect(form.uploadPendingFiles()).resolves.toBeUndefined();
  });
});
