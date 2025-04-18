// vite.config.js
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/vite/dist/node/index.js";
import vue from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import flowbitePlugin from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/flowbite/plugin.js";
import UnoCSS from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/unocss/dist/vite.mjs";
import presetAttributify from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/@unocss/preset-attributify/dist/index.mjs";
import presetIcons from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/@unocss/preset-icons/dist/index.mjs";
import vueDevTools from "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/node_modules/vite-plugin-vue-devtools/dist/vite.mjs";
var __vite_injected_original_import_meta_url = "file:///C:/Users/achmu/VSCode/TriP%20App/triP-app/vite.config.js";
var vite_config_default = defineConfig({
  base: "/trip/",
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => {
            if (tag.startsWith("fwb-")) return false;
            let knownTags = [
              "router-link",
              "router-view",
              "v-runtime-template"
            ];
            if (knownTags.includes(tag)) return false;
            let customTags = [
              "tip"
            ];
            if (customTags.includes(tag)) return true;
            return tag.includes("-");
          }
        }
      }
    }),
    vueDevTools(),
    UnoCSS({
      presets: [
        presetAttributify({
          /* preset options */
        }),
        presetIcons({
          extraProperties: {
            "display": "inline-block",
            "vertical-align": "middle"
            // ...
          }
        })
        // ...custom presets
      ]
    }),
    flowbitePlugin()
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxhY2htdVxcXFxWU0NvZGVcXFxcVHJpUCBBcHBcXFxcdHJpUC1hcHBcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGFjaG11XFxcXFZTQ29kZVxcXFxUcmlQIEFwcFxcXFx0cmlQLWFwcFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvYWNobXUvVlNDb2RlL1RyaVAlMjBBcHAvdHJpUC1hcHAvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tICdub2RlOnVybCdcblxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJ1xuaW1wb3J0IGZsb3diaXRlUGx1Z2luIGZyb20gJ2Zsb3diaXRlL3BsdWdpbidcbmltcG9ydCBVbm9DU1MgZnJvbSAndW5vY3NzL3ZpdGUnXG5pbXBvcnQgcHJlc2V0QXR0cmlidXRpZnkgZnJvbSAnQHVub2Nzcy9wcmVzZXQtYXR0cmlidXRpZnknXG5pbXBvcnQgcHJlc2V0SWNvbnMgZnJvbSAnQHVub2Nzcy9wcmVzZXQtaWNvbnMnXG5pbXBvcnQgdnVlRGV2VG9vbHMgZnJvbSAndml0ZS1wbHVnaW4tdnVlLWRldnRvb2xzJ1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgYmFzZTogJy90cmlwLycsXG4gIHBsdWdpbnM6IFtcbiAgICBcbiAgICB2dWUoe1xuICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgY29tcGlsZXJPcHRpb25zOiB7XG4gICAgICAgICAgaXNDdXN0b21FbGVtZW50OiAodGFnKSA9PiB7XG4gICAgICAgICAgICBpZiAodGFnLnN0YXJ0c1dpdGgoJ2Z3Yi0nKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgbGV0IGtub3duVGFncyA9IFtcbiAgICAgICAgICAgICAgJ3JvdXRlci1saW5rJywgJ3JvdXRlci12aWV3JywgJ3YtcnVudGltZS10ZW1wbGF0ZScsXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKGtub3duVGFncy5pbmNsdWRlcyh0YWcpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBsZXQgY3VzdG9tVGFncyA9IFtcbiAgICAgICAgICAgICAgJ3RpcCcsXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBpZiAoY3VzdG9tVGFncy5pbmNsdWRlcyh0YWcpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiB0YWcuaW5jbHVkZXMoJy0nKTtcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSksXG4gICAgdnVlRGV2VG9vbHMoKSxcbiAgICBVbm9DU1Moe1xuICAgICAgcHJlc2V0czogW1xuICAgICAgICBwcmVzZXRBdHRyaWJ1dGlmeSh7IC8qIHByZXNldCBvcHRpb25zICovfSksXG4gICAgICAgIHByZXNldEljb25zKHsgXG4gICAgICAgICAgZXh0cmFQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAnZGlzcGxheSc6ICdpbmxpbmUtYmxvY2snLFxuICAgICAgICAgICAgJ3ZlcnRpY2FsLWFsaWduJzogJ21pZGRsZScsXG4gICAgICAgICAgICAvLyAuLi5cbiAgICAgICAgICB9LFxuXG4gICAgICAgICB9KSxcbiAgICAgICAgLy8gLi4uY3VzdG9tIHByZXNldHNcbiAgICAgIF0sXG4gICAgfSksXG4gICAgZmxvd2JpdGVQbHVnaW4oKSxcblxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpXG4gICAgfVxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFxVCxTQUFTLGVBQWUsV0FBVztBQUV4VixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFNBQVM7QUFDaEIsT0FBTyxvQkFBb0I7QUFDM0IsT0FBTyxZQUFZO0FBQ25CLE9BQU8sdUJBQXVCO0FBQzlCLE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8saUJBQWlCO0FBUnlLLElBQU0sMkNBQTJDO0FBV2xQLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxFQUNOLFNBQVM7QUFBQSxJQUVQLElBQUk7QUFBQSxNQUNGLFVBQVU7QUFBQSxRQUNSLGlCQUFpQjtBQUFBLFVBQ2YsaUJBQWlCLENBQUMsUUFBUTtBQUN4QixnQkFBSSxJQUFJLFdBQVcsTUFBTSxFQUFHLFFBQU87QUFDbkMsZ0JBQUksWUFBWTtBQUFBLGNBQ2Q7QUFBQSxjQUFlO0FBQUEsY0FBZTtBQUFBLFlBQ2hDO0FBQ0EsZ0JBQUksVUFBVSxTQUFTLEdBQUcsRUFBRyxRQUFPO0FBQ3BDLGdCQUFJLGFBQWE7QUFBQSxjQUNmO0FBQUEsWUFDRjtBQUNBLGdCQUFJLFdBQVcsU0FBUyxHQUFHLEVBQUcsUUFBTztBQUNyQyxtQkFBTyxJQUFJLFNBQVMsR0FBRztBQUFBLFVBQ3pCO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFBQSxJQUNELFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxNQUNMLFNBQVM7QUFBQSxRQUNQLGtCQUFrQjtBQUFBO0FBQUEsUUFBc0IsQ0FBQztBQUFBLFFBQ3pDLFlBQVk7QUFBQSxVQUNWLGlCQUFpQjtBQUFBLFlBQ2YsV0FBVztBQUFBLFlBQ1gsa0JBQWtCO0FBQUE7QUFBQSxVQUVwQjtBQUFBLFFBRUQsQ0FBQztBQUFBO0FBQUEsTUFFSjtBQUFBLElBQ0YsQ0FBQztBQUFBLElBQ0QsZUFBZTtBQUFBLEVBRWpCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLGNBQWMsSUFBSSxJQUFJLFNBQVMsd0NBQWUsQ0FBQztBQUFBLElBQ3REO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
