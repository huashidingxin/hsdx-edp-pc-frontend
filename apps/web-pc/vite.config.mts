import { defineConfig } from '@vben/vite-config'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(async () => {
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
            // mock代理目标地址
            target: 'https://dev.cpzhongzhou.com/api',
            ws: true,
          },
        },
      },
    },
  };
})
