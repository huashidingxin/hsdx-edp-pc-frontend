import { defineConfig } from '@vben/vite-config'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 后端 API 代理目标：默认线上 dev；本地联调可 .env.development 设 VITE_PROXY_TARGET=http://127.0.0.1:8123/api
  const proxyTarget = env.VITE_PROXY_TARGET || 'https://dev.cpzhongzhou.com/api'
  return {
    application: {},

    vite: {
      // base: '/admin/',
      plugins: [
        VueRouter({
          dts: 'src/typed-router.d.ts',
        }),
        AutoImport({
          imports: [
            'vue',
            {
              'vue-router/auto': ['useRoute', 'useRouter'],
            }
          ],
          dts: 'src/auto-imports.d.ts',
          eslintrc: {
            enabled: true,
          },
          vueTemplate: true,
        }),
        Components({
          dts: 'src/components.d.ts',
        }),
      ],
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
        dedupe: ['pinia','vue','vue-router','react-dom','vite'],
        extensions: [
          '.js',
          '.json',
          '.jsx',
          '.mjs',
          '.ts',
          '.tsx',
          '.vue',
        ],
      },
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            target: proxyTarget,
            ws: true,
          },
        },
      },
    },
  };
})
