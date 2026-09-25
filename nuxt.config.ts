export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  css: ['vuetify/styles', '~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '博物声 · 展陈脚本工作台',
      meta: [{ name: 'description', content: '博物馆多语言展陈脚本编写、审校与版本管理工作台' }]
    }
  },
  nitro: { preset: 'static' },
  compatibilityDate: '2025-01-01'
})
