import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import flowbitePlugin from 'flowbite/plugin'
import UnoCSS from 'unocss/vite'
import presetAttributify from '@unocss/preset-attributify'
import presetIcons from '@unocss/preset-icons'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/trip/',
  plugins: [
    
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => {
            if (tag.startsWith('fwb-')) return false;
            let knownTags = [
              'router-link', 'router-view', 'v-runtime-template',
            ];
            if (knownTags.includes(tag)) return false;
            let customTags = [
              'tip',
            ]
            if (customTags.includes(tag)) return true;
            return tag.includes('-');
          },
        }
      }
    }),
    vueDevTools(),
    UnoCSS({
      presets: [
        presetAttributify({ /* preset options */}),
        presetIcons({ 
          extraProperties: {
            'display': 'inline-block',
            'vertical-align': 'middle',
            // ...
          },

         }),
        // ...custom presets
      ],
    }),
    flowbitePlugin(),

  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
