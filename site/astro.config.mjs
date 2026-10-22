import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// Set SITE_URL in the deploy workflow if the Netlify site gets a custom domain.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://ai-shorts-studio-demo.netlify.app',
  integrations: [sitemap()]
})
