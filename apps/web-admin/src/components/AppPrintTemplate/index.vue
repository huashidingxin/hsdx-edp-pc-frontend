<template>
  <div class="app-print-template">
    <div class="d-flex flex-wrap align-center gap-1 mb-2 pt-toolbar">
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        :color="isActive('bold') ? 'primary' : undefined"
        @click="editor?.chain().focus().toggleBold().run()"
        ><b>B</b></v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        :color="isActive('italic') ? 'primary' : undefined"
        @click="editor?.chain().focus().toggleItalic().run()"
        ><i>I</i></v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        :color="isActive('underline') ? 'primary' : undefined"
        @click="editor?.chain().focus().toggleUnderline().run()"
        ><u>U</u></v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        :color="isActive('strike') ? 'primary' : undefined"
        @click="editor?.chain().focus().toggleStrike().run()"
        ><s>S</s></v-btn
      >
      <v-divider vertical />
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"
        >H1</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
        >H2</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
        >H3</v-btn
      >
      <v-divider vertical />
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleBulletList().run()"
        >• 列表</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleOrderedList().run()"
        >1. 列表</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().setTextAlign('left').run()"
        >左</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().setTextAlign('center').run()"
        >中</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().setTextAlign('right').run()"
        >右</v-btn
      >
      <v-divider vertical />
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="openLink"
        >链接</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="fileInput?.click()"
        >图片</v-btn
      >
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="onFilePicked"
      />
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="
          editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        "
        >表格</v-btn
      >
      <v-btn
        size="x-small"
        variant="outlined"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleBlockquote().run()"
        >引用</v-btn
      >
      <v-divider vertical />
      <v-menu :close-on-content-click="false">
        <template #activator="{ props: menuProps }">
          <v-btn size="x-small" variant="outlined" v-bind="menuProps" :disabled="!editor"
            >表单插值</v-btn
          >
        </template>
        <v-sheet class="pa-2" style="max-height: 320px; overflow: auto">
          <template v-for="model in formModels" :key="model.key">
            <div v-if="!model.children">
              <v-btn
                block
                variant="text"
                size="small"
                class="justify-start"
                @click="insertPlaceholder(model.key, model.name)"
                >{{ model.name }}
                <code class="ml-1">{{ '{' + model.key + '}' }}</code></v-btn
              >
            </div>
            <div v-else>
              <div class="text-caption text-medium-emphasis px-2">
                {{ model.name }}
              </div>
              <v-btn
                v-for="child in model.children"
                :key="child.key"
                block
                variant="text"
                size="small"
                class="justify-start"
                @click="insertPlaceholder(model.key + '.' + child.key, model.name + ':' + child.name)"
                >{{ child.name }}
                <code class="ml-1">{{ '{' + (model.key + '.' + child.key) + '}' }}</code></v-btn
              >
            </div>
          </template>
          <div
            v-if="!formModels.length"
            class="text-caption pa-2 text-medium-emphasis"
          >
            无可用字段
          </div>
        </v-sheet>
      </v-menu>
    </div>
    <EditorContent v-if="editor" :editor="editor" class="pt-content" />
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';

import { upload as uploadFile } from '#/api';

import { createPrintTemplateExtensions } from './extensions';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  formModels: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['update:model-value']);

async function uploadImage(file) {
  const result = await uploadFile(file, {});
  if (typeof result === 'string') {
    return result;
  }
  return result?.url ?? result?.default ?? '';
}

const editor = useEditor({
  content: props.modelValue,
  extensions: createPrintTemplateExtensions({ upload: uploadImage }),
  onUpdate: ({ editor }) => {
    emit('update:model-value', editor.getHTML());
  },
});

const fileInput = ref(null);

function isActive(name, attrs) {
  if (!editor.value) return false;
  return attrs ? editor.value.isActive(name, attrs) : editor.value.isActive(name);
}

function openLink() {
  if (!editor.value) return;
  const previous = editor.value.getAttributes('link').href || '';
  const url = window.prompt('链接地址', previous);
  if (url === null) return;
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

async function onFilePicked(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const url = await uploadImage(file);
    if (url) {
      editor.value?.chain().focus().setImage({ src: url }).run();
    }
  }
  e.target.value = '';
}

function insertPlaceholder(key, name) {
  editor.value?.chain().focus().insertContent({
    type: 'placeholderToken',
    attrs: { key, name },
  }).run();
}

watch(
  () => props.modelValue,
  (val) => {
    if (!editor.value) return;
    if (val !== editor.value.getHTML()) {
      editor.value.commands.setContent(val || '', { emitUpdate: false });
    }
  },
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<style scoped>
.pt-content {
  min-height: 240px;
  max-height: 520px;
  padding: 12px;
  overflow: auto;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 4px;
}

.pt-content :deep(.ProseMirror) {
  min-height: 220px;
  outline: none;
}

.pt-content :deep(.vben-tiptap__image),
.pt-content :deep(img) {
  max-width: 100%;
}

.pt-content :deep(table) {
  width: 100%;
  margin: 0.75rem 0;
  border-collapse: collapse;
}

.pt-content :deep(table td),
.pt-content :deep(table th) {
  padding: 6px 10px;
  vertical-align: top;
  border: 1px solid #d0d0d0;
}

.pt-content :deep(.placeholder) {
  padding: 2px 4px;
  margin: 0 1px;
  cursor: default;
  outline-offset: -2px;
  background: #ff0;
  border-radius: 2px;
}
</style>
