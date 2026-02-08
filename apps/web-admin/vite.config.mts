// Plugins
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
// import Layouts from 'vite-plugin-vue-layouts'
// import Vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// Utilities
// import { defineConfig } from 'vite'
import { defineConfig } from '@vben/vite-config';
import { fileURLToPath, URL } from 'node:url'
import { lazyImport, VxeResolver } from 'vite-plugin-lazy-import'
import vue from '@vitejs/plugin-vue'

const isElectron = process.env.BUILD_TARGET === 'electron'
// https://vitejs.dev/config/
export default defineConfig(async ()=>{
  return {
    application: {},
    vite:{
      // build: {
      //   sourcemap: true,
      //   rollupOptions: {
      //     treeshake: false,
      //
      //   },
      // },
      build: {
        rollupOptions: {
          external: ['electron'], // 避免打包 electron 相关模块
        }
      },
      optimizeDeps: {
        exclude: ['electron']
      },
      // base: './',
      plugins: [
        VueRouter({
          dts: 'src/typed-router.d.ts',
        }),

        // Layouts(),
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
        // vue({
        //   template: { transformAssetUrls },
        // }),
        // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
        // Vuetify({
        //   //autoImport: true,
        //   styles: {
        //     configFile: 'src/styles/settings.scss',
        //   },
        // }),
        Vuetify(),
        Fonts({
          google: {
            families: [ {
              name: 'Roboto',
              styles: 'wght@100;300;400;500;700;900',
            }],
          },
        }),
        lazyImport({
          resolvers: [
            VxeResolver({
              libraryName: 'vxe-pc-ui'
            })
          ]
        })
      ],
      define: { 'process.env': {} },
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
        port: 3000,
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'https://www.cpzhongzhou.com/api',
            ws: true
          },
        },
      },
      css: {
        preprocessorOptions: {
          sass: {
            api: 'modern-compiler',
          },
        },
      },
    }
  }
})
