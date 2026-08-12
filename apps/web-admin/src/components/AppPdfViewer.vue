<template>
  <div class="pdf-viewer">
    <div class="toolbar">
      <button @click="prevPage" :disabled="currentPage <= 1">上一页</button>
      <span>第 {{ currentPage }} 页 / 共 {{ pageCount || '--' }} 页</span>
      <button @click="nextPage" :disabled="currentPage >= pageCount">下一页</button>
      <input
        type="number"
        v-model.number="inputPage"
        @keyup.enter="goToPage"
        :min="1"
        :max="pageCount"
      >
      <button @click="goToPage">跳转</button>
      <span>缩放: </span>
      <select v-model="scale">
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1" selected>100%</option>
        <option value="1.25">125%</option>
        <option value="1.5">150%</option>
        <option value="2">200%</option>
      </select>
    </div>

    <div class="pdf-container" ref="pdfContainer">
      <canvas ref="pdfCanvas"></canvas>
    </div>

    <div class="loading" v-if="loading">
      加载中...
    </div>

    <div class="error" v-if="error">
      加载PDF失败: {{ error }}
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

// 设置 worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';

export default {
  name: 'PDFViewer',
  props: {
    src: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const pdfCanvas = ref(null);
    const pdfContainer = ref(null);
    const pdfDoc = ref(null);
    const pageCount = ref(0);
    const currentPage = ref(1);
    const inputPage = ref(1);
    const scale = ref(1);
    const loading = ref(false);
    const error = ref(null);

    // 渲染当前页
    const renderPage = async (pageNum) => {
      if (!pdfDoc.value || pageNum < 1 || pageNum > pageCount.value) return;

      try {
        loading.value = true;
        currentPage.value = pageNum;
        inputPage.value = pageNum;

        const page = await pdfDoc.value.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale.value });

        // 设置 canvas 尺寸
        const canvas = pdfCanvas.value;
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // 渲染 PDF 页面到 canvas
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

      } catch (err) {
        error.value = err.message;
        console.error('PDF渲染错误:', err);
      } finally {
        loading.value = false;
      }
    };

    // 加载 PDF 文档
    const loadPDF = async () => {
      try {
        loading.value = true;
        error.value = null;

        // 加载 PDF 文档
        const loadingTask = pdfjsLib.getDocument(props.src);
        pdfDoc.value = await loadingTask.promise;
        pageCount.value = pdfDoc.value.numPages;

        // 渲染第一页
        await renderPage(1);
      } catch (err) {
        error.value = err.message;
        console.error('PDF加载错误:', err);
      } finally {
        loading.value = false;
      }
    };

    // 上一页
    const prevPage = () => {
      if (currentPage.value > 1) {
        renderPage(currentPage.value - 1);
      }
    };

    // 下一页
    const nextPage = () => {
      if (currentPage.value < pageCount.value) {
        renderPage(currentPage.value + 1);
      }
    };

    // 跳转到指定页
    const goToPage = () => {
      const pageNum = Math.max(1, Math.min(inputPage.value, pageCount.value));
      renderPage(pageNum);
    };

    // 监听 scale 变化重新渲染
    watch(scale, () => {
      if (pdfDoc.value) {
        renderPage(currentPage.value);
      }
    });

    // 监听 src 变化重新加载
    watch(() => props.src, () => {
      loadPDF();
    });

    // 初始化加载 PDF
    onMounted(() => {
      loadPDF();
    });

    // 清理
    onBeforeUnmount(() => {
      if (pdfDoc.value) {
        pdfDoc.value.destroy();
      }
    });

    return {
      pdfCanvas,
      pdfContainer,
      pdfDoc,
      pageCount,
      currentPage,
      inputPage,
      scale,
      loading,
      error,
      prevPage,
      nextPage,
      goToPage
    };
  }
};
</script>

<style scoped>
.pdf-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: #f0f0f0;
}

.pdf-container {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background-color: #525659;
}

canvas {
  margin: 20px;
  box-shadow: 0 0 10px rgb(0 0 0 / 50%);
}

.loading, .error {
  padding: 20px;
  color: #666;
  text-align: center;
}

.error {
  color: #f44336;
}

input[type="number"] {
  width: 50px;
  text-align: center;
}
</style>
