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
