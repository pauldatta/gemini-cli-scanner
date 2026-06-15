import { defineConfig } from 'vitepress'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))

export default defineConfig({
  title: 'gemini-cli-scanner',
  description: 'Audit and discover patterns across your AI coding tool ecosystem.',
  base: '/gemini-cli-scanner/',

  head: [
    ['link', { rel: 'icon', href: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔍</text></svg>' }],
    ['meta', { property: 'og:title', content: 'gemini-cli-scanner' }],
    ['meta', { property: 'og:description', content: 'Audit and discover patterns across your AI coding tool ecosystem.' }],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: `🔍 gemini-cli-scanner`,

    nav: [
      { text: 'Guide', link: '/guide/quick-start' },
      { text: 'Reference', link: '/reference/scanning' },
      {
        text: `v${pkg.version}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/pauldatta/gemini-cli-scanner/blob/main/CHANGELOG.md' },
          { text: 'npm', link: 'https://www.npmjs.com/package/gemini-cli-scanner' },
        ]
      }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'For Teams', link: '/guide/teams' },
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'What Gets Scanned', link: '/reference/scanning' },
          { text: 'Advisory Engine', link: '/reference/advisory-engine' },
          { text: 'Skill Suggestions', link: '/reference/skill-suggestions' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/pauldatta/gemini-cli-scanner' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/pauldatta/gemini-cli-scanner/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the Apache-2.0 License.',
    },
  },
})
