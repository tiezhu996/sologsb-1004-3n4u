import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    components,
    directives,
    theme: {
      defaultTheme: 'museum',
      themes: {
        museum: {
          dark: false,
          colors: {
            primary: '#8A3B2E',
            secondary: '#315B55',
            surface: '#FFFDF8',
            background: '#F4F0E8',
            error: '#B3261E',
            warning: '#B26A00',
            success: '#2F6B45'
          }
        }
      }
    },
    defaults: {
      VBtn: { rounded: 'lg' },
      VCard: { rounded: 'xl', elevation: 0 },
      VTextField: { variant: 'outlined', density: 'comfortable' },
      VTextarea: { variant: 'outlined' },
      VSelect: { variant: 'outlined', density: 'comfortable' }
    }
  })
  nuxtApp.vueApp.use(vuetify)
})
