<template>
  <div class="main-container">
    <div
      class="editor-container editor-container_classic-editor editor-container_include-style editor-container_include-word-count"
      ref="editorContainerElement"
    >
      <div class="editor-container__editor">
        <div ref="editorElement">
          <ckeditor v-if="editor && config" v-model="content" :editor="editor" :config="config" @ready="onReady" />
        </div>
      </div>
      <div class="editor_container__word-count" ref="editorWordCountElement"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, useTemplateRef } from 'vue';
import { Ckeditor } from '@ckeditor/ckeditor5-vue';
import Placeholder from './plugins/placeholder.js'  // 引入自定义插件

import {
  ClassicEditor,
  Alignment,
  Autoformat,
  AutoImage,
  AutoLink,
  Autosave,
  BlockQuote,
  Bold,
  Bookmark,
  Code,
  CodeBlock,
  Essentials,
  FindAndReplace,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  FullPage,
  GeneralHtmlSupport,
  Heading,
  Highlight,
  HorizontalLine,
  HtmlComment,
  HtmlEmbed,
  ImageBlock,
  ImageCaption,
  ImageInline,
  ImageInsert,
  ImageInsertViaUrl,
  ImageResize,
  ImageStyle,
  ImageTextAlternative,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  LinkImage,
  List,
  ListProperties,
  Markdown,
  MediaEmbed,
  Mention,
  PageBreak,
  Paragraph,
  PasteFromMarkdownExperimental,
  PasteFromOffice,
  RemoveFormat,
  ShowBlocks,
  SimpleUploadAdapter,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersArrows,
  SpecialCharactersCurrency,
  SpecialCharactersEssentials,
  SpecialCharactersLatin,
  SpecialCharactersMathematical,
  SpecialCharactersText,
  Strikethrough,
  Style,
  Subscript,
  Superscript,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  TextPartLanguage,
  TextTransformation,
  Title,
  TodoList,
  Underline,
  WordCount,
} from 'ckeditor5';


import translations from 'ckeditor5/translations/zh-cn.js';

import 'ckeditor5/ckeditor5.css';
import './style.css';

import ImageUploadAdapter from "@/components/AppEditor/adapter/ImageUploadAdapter.js";

const props = defineProps({
  modelValue:{
    type:String,
    default:''
  },
  formModels:{
    type:Array,
    default:()=>([])
  }
})

const emit = defineEmits(['update:model-value'])

const content = ref('')

watch(()=>props.modelValue,(newValue)=>{
  content.value = newValue
})

watch(content,(newVal)=>{
  console.log('WATCH CONT')
  emit('update:model-value',newVal)
})
/**
 * Create a free account with a trial: https://portal.ckeditor.com/checkout?plan=free
 */
const LICENSE_KEY = 'GPL'; // or <YOUR_LICENSE_KEY>.

const editorWordCount = useTemplateRef('editorWordCountElement');

const isLayoutReady = ref(false);

const editor = ClassicEditor;

const config = computed(() => {
  if (!isLayoutReady.value) {
    return null;
  }

  return {
    toolbar: {
      // items: [
      //   'sourceEditing',
      //   'showBlocks',
      //   'findAndReplace',
      //   'textPartLanguage',
      //   '|',
      //   //'heading',
      //   'style',
      //   '|',
      //   'fontSize',
      //   'fontFamily',
      //   'fontColor',
      //   'fontBackgroundColor',
      //   '|',
      //   'bold',
      //   'italic',
      //   'underline',
      //   'strikethrough',
      //   'subscript',
      //   'superscript',
      //   'code',
      //   'removeFormat',
      //   '|',
      //   'specialCharacters',
      //   'horizontalLine',
      //   'pageBreak',
      //   'link',
      //   'bookmark',
      //   'insertImage',
      //   'mediaEmbed',
      //   'insertTable',
      //   'highlight',
      //   'blockQuote',
      //   'codeBlock',
      //   'htmlEmbed',
      //   '|',
      //   'alignment',
      //   '|',
      //   'bulletedList',
      //   'numberedList',
      //   'todoList',
      //   'outdent',
      //   'indent'
      // ],
      items:[
        'sourceEditing',
        'placeholder',
        'heading',
        '|',
        'bold',
        'italic',
        'underline',
        'alignment',
        '|',
        'link',
        'insertImage',
        'ckbox',
        'mediaEmbed',
        'insertTable',
        'blockQuote',
        '|',
        'bulletedList',
        'numberedList',
        'todoList',
        'outdent',
        'indent'
      ],
      shouldNotGroupWhenFull: false
    },
    plugins: [
      Alignment,
      Autoformat,
      AutoImage,
      AutoLink,
      Autosave,
      BlockQuote,
      Bold,
      Bookmark,
      Code,
      CodeBlock,
      Essentials,
      FindAndReplace,
      FontBackgroundColor,
      FontColor,
      FontFamily,
      FontSize,
      FullPage,
      GeneralHtmlSupport,
      Heading,
      Highlight,
      HorizontalLine,
      HtmlComment,
      HtmlEmbed,
      ImageBlock,
      ImageCaption,
      ImageInline,
      ImageInsert,
      ImageInsertViaUrl,
      ImageResize,
      ImageStyle,
      ImageTextAlternative,
      ImageToolbar,
      ImageUpload,
      Indent,
      IndentBlock,
      Italic,
      Link,
      LinkImage,
      List,
      ListProperties,
      Markdown,
      MediaEmbed,
      Mention,
      PageBreak,
      Paragraph,
      PasteFromMarkdownExperimental,
      PasteFromOffice,
      RemoveFormat,
      ShowBlocks,
      SimpleUploadAdapter,
      SourceEditing,
      SpecialCharacters,
      SpecialCharactersArrows,
      SpecialCharactersCurrency,
      SpecialCharactersEssentials,
      SpecialCharactersLatin,
      SpecialCharactersMathematical,
      SpecialCharactersText,
      Strikethrough,
      Style,
      Subscript,
      Superscript,
      Table,
      TableCaption,
      TableCellProperties,
      TableColumnResize,
      TableProperties,
      TableToolbar,
      TextPartLanguage,
      TextTransformation,
      // Title,
      TodoList,
      Underline,
      WordCount,
      Placeholder
    ],
    placeholderConfig: {
      models: props.formModels,
    },
    fontFamily: {
      supportAllValues: true
    },
    fontSize: {
      options: [10, 12, 14, 'default', 18, 20, 22],
      supportAllValues: true
    },
    // heading: {
    //   options: [
    //     {
    //       model: 'paragraph',
    //       title: 'Paragraph',
    //       class: 'ck-heading_paragraph'
    //     },
    //     {
    //       model: 'heading1',
    //       view: 'h1',
    //       title: 'Heading 1',
    //       class: 'ck-heading_heading1'
    //     },
    //     {
    //       model: 'heading2',
    //       view: 'h2',
    //       title: 'Heading 2',
    //       class: 'ck-heading_heading2'
    //     },
    //     {
    //       model: 'heading3',
    //       view: 'h3',
    //       title: 'Heading 3',
    //       class: 'ck-heading_heading3'
    //     },
    //     {
    //       model: 'heading4',
    //       view: 'h4',
    //       title: 'Heading 4',
    //       class: 'ck-heading_heading4'
    //     },
    //     {
    //       model: 'heading5',
    //       view: 'h5',
    //       title: 'Heading 5',
    //       class: 'ck-heading_heading5'
    //     },
    //     {
    //       model: 'heading6',
    //       view: 'h6',
    //       title: 'Heading 6',
    //       class: 'ck-heading_heading6'
    //     }
    //   ]
    // },
    htmlSupport: {
      allow: [
        {
          name: /^.*$/,
          styles: true,
          attributes: true,
          classes: true
        }
      ]
    },
    image: {
      toolbar: [
        'toggleImageCaption',
        'imageTextAlternative',
        '|',
        'imageStyle:inline',
        'imageStyle:wrapText',
        'imageStyle:breakText',
        '|',
        'resizeImage'
      ]
    },
    // initialData: '',
    language: 'zh-cn',
    licenseKey: LICENSE_KEY,
    link: {
      addTargetToExternalLinks: true,
      defaultProtocol: 'https://',
      decorators: {
        toggleDownloadable: {
          mode: 'manual',
          label: 'Downloadable',
          attributes: {
            download: 'file'
          }
        }
      }
    },
    // list: {
    //   properties: {
    //     styles: true,
    //     startIndex: true,
    //     reversed: true
    //   }
    // },
    // mention: {
    //   feeds: [
    //     {
    //       marker: '@',
    //       feed: [
    //         /* See: https://ckeditor.com/docs/ckeditor5/latest/features/mentions.html */
    //       ]
    //     }
    //   ]
    // },
    // placeholder: 'Type or paste your content here!',
    style: {
      definitions: [
        {
          name: 'Article category',
          element: 'h3',
          classes: ['category']
        },
        {
          name: 'Title',
          element: 'h2',
          classes: ['document-title']
        },
        {
          name: 'Subtitle',
          element: 'h3',
          classes: ['document-subtitle']
        },
        {
          name: 'Info box',
          element: 'p',
          classes: ['info-box']
        },
        {
          name: 'Side quote',
          element: 'blockquote',
          classes: ['side-quote']
        },
        {
          name: 'Marker',
          element: 'span',
          classes: ['marker']
        },
        {
          name: 'Spoiler',
          element: 'span',
          classes: ['spoiler']
        },
        {
          name: 'Code (dark)',
          element: 'pre',
          classes: ['fancy-code', 'fancy-code-dark']
        },
        {
          name: 'Code (bright)',
          element: 'pre',
          classes: ['fancy-code', 'fancy-code-bright']
        }
      ]
    },
    table: {
      contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells', 'tableProperties', 'tableCellProperties']
    },
    translations: [translations]
  };
});

onMounted(() => {
  isLayoutReady.value = true;


});

function onReady(editor) {
  [...editorWordCount.value.children].forEach(child => child.remove());

  const wordCount = editor.plugins.get('WordCount');
  editorWordCount.value.appendChild(wordCount.wordCountContainer);

  // // 获取工具栏视图
  // const toolbarView = editor.ui.view.toolbar
  // console.log(toolbarView)
  // // 监听工具栏按钮点击
  // toolbarView.items.forEach(item => {
  //   console.log(item)
  //   if (item.label) {
  //     item.on('execute', () => {
  //       console.log(`${item.label} clicked!`);  // 打印按钮名称
  //     });
  //   }
  // });
  editor.plugins.get('FileRepository').createUploadAdapter = (loader) => {
    return new ImageUploadAdapter(loader)
  }
}
</script>

<style scoped>
/*@import "./plugins/theme/placeholder.css";*/
:deep(.placeholder) {
  background: #ffff00;
  padding: 4px 2px;
  outline-offset: -2px;
  line-height: 1em;
  margin: 0 1px;
}

:deep(.placeholder::selection) {
  display: none;
}

</style>
