import type { AssetsGeneratorConfig } from '@vite-pwa/assets-generator/config'
import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
    maskable: { sizes: [512] },
    apple: { sizes: [180] },
  },
  images: ['public/icon-source.svg'],
}) satisfies AssetsGeneratorConfig
